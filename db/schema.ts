import {
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
  index,
} from "drizzle-orm/sqlite-core";

const timestamps = {
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
};

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email"),
  name: text("name"),
  ...timestamps,
});
export const settings = sqliteTable(
  "settings",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    key: text("key").notNull(),
    value: text("value").notNull(),
    ...timestamps,
  },
  (t) => [uniqueIndex("idx_settings_user_key").on(t.userId, t.key)],
);
export const providers = sqliteTable(
  "providers",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    type: text("type").notNull(),
    name: text("name").notNull(),
    baseUrl: text("base_url"),
    encryptedKey: text("encrypted_key").notNull(),
    keyHint: text("key_hint").notNull(),
    enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
    config: text("config").notNull().default("{}"),
    ...timestamps,
  },
  (t) => [index("idx_providers_user").on(t.userId)],
);
export const integrations = sqliteTable(
  "integrations",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    type: text("type").notNull(),
    name: text("name").notNull(),
    encryptedSecret: text("encrypted_secret").notNull(),
    secretHint: text("secret_hint").notNull(),
    config: text("config").notNull().default("{}"),
    enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
    ...timestamps,
  },
  (t) => [index("idx_integrations_user_type").on(t.userId, t.type)],
);
export const folders = sqliteTable(
  "folders",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    name: text("name").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    ...timestamps,
  },
  (t) => [index("idx_folders_user").on(t.userId)],
);
export const projects = sqliteTable(
  "projects",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    folderId: text("folder_id"),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    instructions: text("instructions").notNull().default(""),
    memory: text("memory").notNull().default(""),
    architecture: text("architecture").notNull().default(""),
    decisions: text("decisions").notNull().default("[]"),
    dependencies: text("dependencies").notNull().default("[]"),
    techStack: text("tech_stack").notNull().default("[]"),
    summary: text("summary").notNull().default(""),
    autoApply: integer("auto_apply", { mode: "boolean" })
      .notNull()
      .default(false),
    ...timestamps,
  },
  (t) => [index("idx_projects_user").on(t.userId)],
);
export const conversations = sqliteTable(
  "conversations",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    projectId: text("project_id"),
    folderId: text("folder_id"),
    title: text("title").notNull(),
    mode: text("mode").notNull().default("chat"),
    providerId: text("provider_id"),
    modelId: text("model_id"),
    instructions: text("instructions").notNull().default(""),
    pinned: integer("pinned", { mode: "boolean" }).notNull().default(false),
    archived: integer("archived", { mode: "boolean" }).notNull().default(false),
    ...timestamps,
  },
  (t) => [
    index("idx_conversations_user_updated").on(t.userId, t.updatedAt),
    index("idx_conversations_project").on(t.projectId),
  ],
);
export const messages = sqliteTable(
  "messages",
  {
    id: text("id").primaryKey(),
    conversationId: text("conversation_id").notNull(),
    role: text("role").notNull(),
    content: text("content").notNull(),
    parentId: text("parent_id"),
    provider: text("provider"),
    model: text("model"),
    inputTokens: integer("input_tokens").notNull().default(0),
    cachedTokens: integer("cached_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    costUsd: real("cost_usd"),
    metadata: text("metadata").notNull().default("{}"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [
    index("idx_messages_conversation_created").on(
      t.conversationId,
      t.createdAt,
    ),
  ],
);
export const projectFiles = sqliteTable(
  "project_files",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id").notNull(),
    path: text("path").notNull(),
    content: text("content").notNull(),
    language: text("language"),
    version: integer("version").notNull().default(1),
    ...timestamps,
  },
  (t) => [uniqueIndex("idx_project_files_path").on(t.projectId, t.path)],
);
export const proposedChanges = sqliteTable(
  "proposed_changes",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id").notNull(),
    conversationId: text("conversation_id").notNull(),
    messageId: text("message_id"),
    operation: text("operation").notNull(),
    path: text("path").notNull(),
    newPath: text("new_path"),
    beforeContent: text("before_content"),
    afterContent: text("after_content"),
    status: text("status").notNull().default("pending"),
    ...timestamps,
  },
  (t) => [index("idx_changes_project_status").on(t.projectId, t.status)],
);
export const memories = sqliteTable(
  "memories",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    projectId: text("project_id"),
    conversationId: text("conversation_id"),
    scope: text("scope").notNull(),
    content: text("content").notNull(),
    enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
    ...timestamps,
  },
  (t) => [
    index("idx_memories_scope").on(t.userId, t.projectId, t.conversationId),
  ],
);
export const usageEvents = sqliteTable(
  "usage_events",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    projectId: text("project_id"),
    conversationId: text("conversation_id"),
    messageId: text("message_id"),
    provider: text("provider").notNull(),
    model: text("model").notNull(),
    inputTokens: integer("input_tokens").notNull().default(0),
    cachedTokens: integer("cached_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    costUsd: real("cost_usd"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [
    index("idx_usage_user_created").on(t.userId, t.createdAt),
    index("idx_usage_project").on(t.projectId),
  ],
);
export const attachments = sqliteTable(
  "attachments",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    projectId: text("project_id"),
    conversationId: text("conversation_id"),
    name: text("name").notNull(),
    mimeType: text("mime_type").notNull(),
    size: integer("size").notNull(),
    objectKey: text("object_key").notNull(),
    extractedText: text("extracted_text"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [
    index("idx_attachments_project").on(t.projectId),
    index("idx_attachments_conversation").on(t.conversationId),
  ],
);
export const gitCommits = sqliteTable(
  "git_commits",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id").notNull(),
    parentId: text("parent_id"),
    branch: text("branch").notNull().default("main"),
    message: text("message").notNull(),
    snapshot: text("snapshot").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [
    index("idx_git_commits_project_branch").on(
      t.projectId,
      t.branch,
      t.createdAt,
    ),
  ],
);
