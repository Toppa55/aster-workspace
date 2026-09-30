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
  return (
    isGitHubRequest(prompt) &&
    /\b(open|inspect|review|read|look at|clone|import|edit|change|update|fix|build|create|push|commit|source|files?|code)\b/i.test(
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
