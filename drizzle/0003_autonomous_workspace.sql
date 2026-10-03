ALTER TABLE `projects` ADD `autonomy_level` text DEFAULT 'suggest' NOT NULL;
--> statement-breakpoint
ALTER TABLE `projects` ADD `github_owner` text;
--> statement-breakpoint
ALTER TABLE `projects` ADD `github_repo` text;
--> statement-breakpoint
ALTER TABLE `projects` ADD `github_base_branch` text DEFAULT 'main' NOT NULL;
--> statement-breakpoint
ALTER TABLE `projects` ADD `github_working_branch` text;
--> statement-breakpoint
ALTER TABLE `git_commits` ADD `is_checkpoint` integer DEFAULT false NOT NULL;
--> statement-breakpoint
CREATE TABLE `activity_events` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`conversation_id` text,
	`kind` text NOT NULL,
	`message` text NOT NULL,
	`status` text DEFAULT 'complete' NOT NULL,
	`metadata` text DEFAULT '{}' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_activity_project_created` ON `activity_events` (`project_id`,`created_at`);
--> statement-breakpoint
PRAGMA optimize;
