import type { CodingOperation } from "./types";

/**
 * Project chat is generated from operation metadata, not provider prose. This
 * prevents source returned by a model from leaking into the chat surface.
 */
export function projectWorkspaceMessage(
  operations: CodingOperation[],
  stagedCount = operations.length,
) {
  if (stagedCount === 0 || operations.length === 0) {
    return "I couldn’t produce valid workspace changes for that request. No source code was added to the chat or project. Try again with a little more detail.";
  }

  const counts = operations.reduce<Record<CodingOperation["type"], number>>(
    (totals, operation) => {
      totals[operation.type] += 1;
      return totals;
    },
    { create_file: 0, update_file: 0, delete_file: 0, rename_file: 0 },
  );
  const actions = [
    countLabel(counts.create_file, "created"),
    countLabel(counts.update_file, "updated"),
    countLabel(counts.delete_file, "deleted"),
    countLabel(counts.rename_file, "renamed"),
  ].filter(Boolean);
  const paths = Array.from(
    new Set(
      operations.flatMap((operation) =>
        operation.type === "rename_file"
          ? [operation.path, operation.newPath]
          : [operation.path],
      ),
    ),
  );
  const visiblePaths = paths.slice(0, 6).join(", ");
  const remaining = paths.length - 6;
  const files = `${visiblePaths}${remaining > 0 ? ` and ${remaining} more` : ""}`;

  return `Done. I prepared ${stagedCount} workspace ${stagedCount === 1 ? "change" : "changes"}${actions.length ? ` (${actions.join(", ")})` : ""} across ${files}. Review the diff in the Code workspace, then apply or reject the changes there.`;
}

function countLabel(count: number, verb: string) {
  return count ? `${verb} ${count}` : "";
}
