export const autonomyLevels = [
  "observe",
  "suggest",
  "edit",
  "commit",
  "push",
  "pr",
  "merge",
  "deploy",
] as const;

export type AutonomyLevel = (typeof autonomyLevels)[number];

export function permits(current: string | null | undefined, action: AutonomyLevel) {
  const currentIndex = autonomyLevels.indexOf(
    (current || "suggest") as AutonomyLevel,
  );
  const actionIndex = autonomyLevels.indexOf(action);
  return currentIndex >= actionIndex && actionIndex >= 0;
}

export function safeAutonomyLevel(value: unknown): AutonomyLevel {
  const level = String(value || "suggest") as AutonomyLevel;
  return autonomyLevels.includes(level) ? level : "suggest";
}
