export type ModelVisibility = Record<string, string[]>;
type VisibleModel = {
  id: string;
  name: string;
  capabilities: { tools: boolean; reasoning: boolean };
};

const NON_CHAT =
  /embedding|moderation|image|tts|speech|transcri|whisper|audio|realtime|search|rerank/i;
const STRONG_GENERAL =
  /gpt-[45]|\bo[134]\b|claude|gemini|grok|deepseek|qwen|llama|mistral/i;
const PREVIEW_PENALTY = /preview|experimental|legacy|deprecated|dated/i;

export function curatedModelIds<T extends VisibleModel>(
  models: T[],
  limit = 8,
) {
  return models
    .filter((model) => !NON_CHAT.test(`${model.id} ${model.name}`))
    .map((model) => ({
      model,
      score:
        (STRONG_GENERAL.test(`${model.id} ${model.name}`) ? 5 : 0) +
        (model.capabilities.tools ? 3 : 0) +
        (model.capabilities.reasoning ? 2 : 0) +
        (PREVIEW_PENALTY.test(`${model.id} ${model.name}`) ? -3 : 0),
    }))
    .sort(
      (a, b) => b.score - a.score || a.model.name.localeCompare(b.model.name),
    )
    .slice(0, limit)
    .map(({ model }) => model.id);
}

export function visibleModels<T extends VisibleModel>(
  providerId: string,
  models: T[],
  visibility: unknown,
) {
  const configured = asVisibility(visibility);
  const selected = Object.hasOwn(configured, providerId)
    ? configured[providerId]
    : curatedModelIds(models);
  const ids = new Set(selected);
  return models.filter((model) => ids.has(model.id));
}

export function asVisibility(value: unknown): ModelVisibility {
  if (!value || typeof value !== "object") return {};
  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, string[]] =>
        Array.isArray(entry[1]) &&
        entry[1].every((item) => typeof item === "string"),
    ),
  );
}
