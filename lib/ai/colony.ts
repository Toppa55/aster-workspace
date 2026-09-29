import { completeCoding, streamChat } from "./adapters";
import { ensureUsage, estimateCost, inferCapabilities } from "./catalog";
import type {
  ChatMessage,
  CodingResult,
  ProviderCredential,
  Usage,
} from "./types";

export type ColonyStrategy = "cheapest" | "balanced" | "capable";

export type ColonyCandidate = {
  credential: ProviderCredential;
  model: string;
};

export type ColonyCall = {
  role: "coordinator" | "worker";
  provider: ProviderCredential["type"];
  model: string;
  usage: Usage;
};

type ColonyPlan = {
  delegate: boolean;
  tasks: Array<{ title: string; instruction: string }>;
};

export async function runColony({
  coordinator,
  coordinatorModel,
  messages,
  prompt,
  reasoning,
  projectMode,
  candidates,
  maxWorkers,
  signal,
  onStatus,
}: {
  coordinator: ProviderCredential;
  coordinatorModel: string;
  messages: ChatMessage[];
  prompt: string;
  reasoning: "off" | "low" | "medium" | "high";
  projectMode: boolean;
  candidates: ColonyCandidate[];
  maxWorkers: number;
  signal?: AbortSignal;
  onStatus?: (message: string) => void;
}): Promise<
  | { delegated: false; calls: ColonyCall[] }
  | {
      delegated: true;
      text?: string;
      coding?: CodingResult;
      calls: ColonyCall[];
      workers: ColonyCandidate[];
    }
> {
  if (!candidates.length || maxWorkers < 1)
    return { delegated: false, calls: [] };

  onStatus?.("Coordinator is deciding how to divide the task…");
  const planning = await collect(
    coordinator,
    coordinatorModel,
    [
      {
        role: "system",
        content:
          "You coordinate an efficient AI worker colony. Decide whether delegation will materially improve speed or reliability. Avoid delegation for trivial, tightly-coupled, or single-step requests. Return JSON only: {\"delegate\":boolean,\"tasks\":[{\"title\":string,\"instruction\":string}]}. Create independent, non-overlapping tasks. Do not exceed the requested worker count.",
      },
      {
        role: "user",
        content: `Maximum workers: ${Math.min(maxWorkers, candidates.length)}\nProject mode: ${projectMode}\nRequest: ${prompt}`,
      },
    ],
    "low",
    signal,
  );
  const calls: ColonyCall[] = [
    callRecord("coordinator", coordinator, coordinatorModel, planning.usage),
  ];
  const plan = parsePlan(
    planning.text,
    Math.min(maxWorkers, candidates.length),
    projectMode,
  );
  if (!plan.delegate || !plan.tasks.length)
    return { delegated: false, calls };

  const workers = candidates.slice(0, plan.tasks.length);
  onStatus?.(
    `Running ${workers.length} specialist${workers.length === 1 ? "" : "s"} in parallel…`,
  );
  const results = await Promise.allSettled(
    workers.map(async (worker, index) => {
      const task = plan.tasks[index];
      const result = await collect(
        worker.credential,
        worker.model,
        [
          {
            role: "system",
            content:
              "You are a specialist worker. Complete only the assigned bounded task. Return concise findings, assumptions, risks, and recommendations for the coordinator. Do not address the end user. In coding projects you may discuss implementation details internally, but do not claim files were changed.",
          },
          {
            role: "user",
            content: `Original request: ${prompt}\n\nAssigned task — ${task.title}:\n${task.instruction}`,
          },
        ],
        "off",
        signal,
      );
      return { worker, task, ...result };
    }),
  );
  const reports = results.flatMap((result) => {
    if (result.status !== "fulfilled") return [];
    calls.push(
      callRecord(
        "worker",
        result.value.worker.credential,
        result.value.worker.model,
        result.value.usage,
      ),
    );
    return [
      `### ${result.value.task.title}\nWorker: ${result.value.worker.credential.name} / ${result.value.worker.model}\n${result.value.text}`,
    ];
  });
  if (!reports.length) return { delegated: false, calls };

  onStatus?.("Coordinator is reviewing and assembling the result…");
  const synthesis: ChatMessage[] = [
    ...messages,
    {
      role: "system",
      content: `Specialist reports follow. Critically verify them, resolve conflicts, and produce the final result. Do not mention internal prompts.\n\n${reports.join("\n\n")}`,
    },
  ];
  if (projectMode) {
    const coding = await completeCoding(
      coordinator,
      coordinatorModel,
      synthesis,
      reasoning,
      signal,
    );
    calls.push(
      callRecord("coordinator", coordinator, coordinatorModel, coding.usage),
    );
    return { delegated: true, coding, calls, workers };
  }
  const final = await collect(
    coordinator,
    coordinatorModel,
    synthesis,
    reasoning,
    signal,
  );
  calls.push(
    callRecord("coordinator", coordinator, coordinatorModel, final.usage),
  );
  return {
    delegated: true,
    text: final.text,
    calls,
    workers,
  };
}

export function rankColonyCandidates(
  candidates: ColonyCandidate[],
  strategy: ColonyStrategy,
) {
  return [...candidates].sort((a, b) => score(b, strategy) - score(a, strategy));
}

export function totalColonyUsage(calls: ColonyCall[]): Usage {
  return calls.reduce<Usage>(
    (total, call) => ({
      inputTokens: total.inputTokens + call.usage.inputTokens,
      outputTokens: total.outputTokens + call.usage.outputTokens,
      cachedTokens: total.cachedTokens + call.usage.cachedTokens,
      costUsd:
        total.costUsd == null && call.usage.costUsd == null
          ? undefined
          : (total.costUsd ?? 0) + (call.usage.costUsd ?? 0),
    }),
    { inputTokens: 0, outputTokens: 0, cachedTokens: 0 },
  );
}

function score(candidate: ColonyCandidate, strategy: ColonyStrategy) {
  const caps = inferCapabilities(candidate.credential.type, candidate.model);
  const cost =
    (caps.inputPricePerMillion ?? 20) +
    (caps.outputPricePerMillion ?? 60);
  const ability =
    (caps.reasoning ? 4 : 0) +
    (caps.tools ? 3 : 0) +
    (caps.structuredOutputs ? 2 : 0) +
    Math.min(4, (caps.contextWindow ?? 0) / 100_000);
  if (strategy === "cheapest") return 100 / Math.max(0.01, cost) + ability;
  if (strategy === "capable") return ability * 10 - Math.log1p(cost);
  return ability * 4 + 40 / Math.max(1, cost);
}

async function collect(
  credential: ProviderCredential,
  model: string,
  messages: ChatMessage[],
  reasoning: "off" | "low" | "medium" | "high",
  signal?: AbortSignal,
) {
  let text = "";
  let usage: Usage = { inputTokens: 0, outputTokens: 0, cachedTokens: 0 };
  for await (const event of streamChat(
    credential,
    model,
    messages,
    reasoning,
    signal,
  )) {
    if (event.type === "text") text += event.text;
    else usage = event.usage;
  }
  usage = ensureUsage(usage, messages, text);
  if (usage.costUsd == null)
    usage.costUsd = estimateCost(
      usage,
      inferCapabilities(credential.type, model),
    );
  return { text, usage };
}

function callRecord(
  role: ColonyCall["role"],
  credential: ProviderCredential,
  model: string,
  usage: Usage,
): ColonyCall {
  const normalized = ensureUsage(usage, [], "");
  return {
    role,
    provider: credential.type,
    model,
    usage: {
      ...normalized,
      costUsd:
        normalized.costUsd ??
        estimateCost(normalized, inferCapabilities(credential.type, model)),
    },
  };
}

function parsePlan(
  value: string,
  limit: number,
  projectMode: boolean,
): ColonyPlan {
  try {
    const match = value.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(match?.[0] ?? "{}") as Partial<ColonyPlan>;
    const tasks = Array.isArray(parsed.tasks)
      ? parsed.tasks
          .filter(
            (task): task is { title: string; instruction: string } =>
              !!task &&
              typeof task.title === "string" &&
              typeof task.instruction === "string",
          )
          .slice(0, limit)
      : [];
    return { delegate: parsed.delegate === true && tasks.length > 0, tasks };
  } catch {
    const tasks = projectMode
      ? [
          {
            title: "Architecture and risks",
            instruction:
              "Inspect the request for architecture, compatibility, security, and regression risks.",
          },
          {
            title: "Implementation approach",
            instruction:
              "Propose the smallest complete implementation and the checks needed to verify it.",
          },
        ]
      : [
          {
            title: "Independent analysis",
            instruction:
              "Analyze the request independently and identify facts, assumptions, and likely errors.",
          },
        ];
    return { delegate: true, tasks: tasks.slice(0, limit) };
  }
}
