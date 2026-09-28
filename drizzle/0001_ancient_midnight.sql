CREATE TABLE `git_commits` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`parent_id` text,
	`branch` text DEFAULT 'main' NOT NULL,
	`message` text NOT NULL,
	`snapshot` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_git_commits_project_branch` ON `git_commits` (`project_id`,`branch`,`created_at`);
--> statement-breakpoint
PRAGMA optimize;
