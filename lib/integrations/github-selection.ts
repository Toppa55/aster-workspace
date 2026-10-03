export type GitHubRepositorySummary = {
  name: string;
  full_name: string;
};

const githubIntent =
  /\bgithub\b|github\.com|\brepositor(?:y|ies)\b|\brepos?\b|\bpull requests?\b|\bcommits?\b|\bbranches?\b/i;

export function isGitHubRequest(prompt: string) {
  return githubIntent.test(prompt);
}

export function isGitHubWorkspaceRequest(prompt: string) {
  // Account-level requests such as “open my repositories” are lookups, not
  // coding tasks. Keep them in chat instead of creating an empty workspace.
  const genericAccountLookup =
    /\b(accounts?|profiles?)\b/i.test(prompt) ||
    /\b(my|all)\s+(github\s+)?repositor(?:y|ies)|\brepositories\b/i.test(
      prompt,
    );
  const sourceSpecific =
    /\b(source|files?|code|codebase|clone|import|edit|change|update|fix|build|create|push|commit)\b/i.test(
      prompt,
    );
  if (genericAccountLookup && !sourceSpecific) return false;
  return (
    isGitHubRequest(prompt) &&
    /\b(open|browse|inspect|review|read|look at|clone|import|edit|change|update|fix|build|create|push|commit|source|files?|code)\b/i.test(
      prompt,
    )
  );
}

export function repositoryFromPrompt<T extends GitHubRepositorySummary>(
  prompt: string,
  repositories: T[],
) {
  const urlMatch = prompt.match(
    /github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)/i,
  );
  if (urlMatch) {
    const fullName = `${urlMatch[1]}/${urlMatch[2].replace(/\.git$/i, "")}`;
    return repositories.find(
      (repository) =>
        repository.full_name.toLowerCase() === fullName.toLowerCase(),
    );
  }
  return repositories.find((repository) =>
    new RegExp(
      `(^|[^A-Za-z0-9_-])${escapeRegExp(repository.name)}([^A-Za-z0-9_-]|$)`,
      "i",
    ).test(prompt),
  );
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
