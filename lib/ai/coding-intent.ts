const BUILD_VERBS =
  /\b(build|create|make|develop|implement|code|scaffold|generate|design|set up)\b/i;
const BUILD_TARGETS =
  /\b(app|application|website|web app|api|dashboard|component|project|program|script|repository|repo|plugin|extension|game|bot|tool)\b/i;
const CHANGE_VERBS =
  /\b(add|change|update|fix|debug|refactor|remove|rename|rewrite|modify)\b/i;
const CODE_TARGETS =
  /\b(code|source|file|folder|component|function|class|page|dashboard|app|application|website|api|database|schema|test|tests)\b/i;
const EXPLICIT_WORKSPACE =
  /\b(source code|coding project|codebase|project files|file structure|folder structure|create files|write files|build me)\b/i;

export function isCodingWorkspaceRequest(text: string) {
  const value = text.trim();
  if (!value) return false;
  return (
    EXPLICIT_WORKSPACE.test(value) ||
    (BUILD_VERBS.test(value) && BUILD_TARGETS.test(value)) ||
    (CHANGE_VERBS.test(value) && CODE_TARGETS.test(value))
  );
}

export function projectNameFromPrompt(text: string) {
  const compact = text
    .replace(/\s+/g, " ")
    .replace(/^(please\s+)?(can you\s+|could you\s+|i want you to\s+)?/i, "")
    .trim();
  const words = compact.split(" ").slice(0, 6).join(" ");
  return (words || "New project").slice(0, 64);
}
