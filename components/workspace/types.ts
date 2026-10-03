export type Provider = {
  id: string;
  type: string;
  name: string;
  base_url?: string;
  key_hint: string;
  enabled: number | boolean;
  config: string;
};
export type Project = {
  id: string;
  name: string;
  description: string;
  instructions: string;
  memory: string;
  summary: string;
  auto_apply: number | boolean;
  autonomy_level: string;
  github_owner?: string;
  github_repo?: string;
  github_base_branch: string;
  github_working_branch?: string;
  updated_at: number;
};
export type ActivityEvent = {
  id: string;
  project_id: string;
  conversation_id?: string;
  kind: string;
  message: string;
  status: "running" | "complete" | "failed";
  metadata: string;
  created_at: number;
};
export type Checkpoint = {
  id: string;
  message: string;
  created_at: number;
};
export type Conversation = {
  id: string;
  project_id?: string;
  folder_id?: string;
  title: string;
  mode: string;
  provider_id?: string;
  model_id?: string;
  pinned: number | boolean;
  archived: number | boolean;
  updated_at: number;
};
export type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  provider?: string;
  model?: string;
  input_tokens: number;
  output_tokens: number;
  cached_tokens: number;
  cost_usd?: number;
  created_at: number;
  pending?: boolean;
};
export type ProjectFile = {
  id: string;
  project_id: string;
  path: string;
  content: string;
  language?: string;
  version: number;
};
export type Change = {
  id: string;
  operation: string;
  path: string;
  new_path?: string;
  before_content?: string;
  after_content?: string;
  status: string;
};
export type Model = {
  id: string;
  name: string;
  provider: string;
  connectionId?: string;
  capabilities: {
    contextWindow?: number;
    inputPricePerMillion?: number;
    outputPricePerMillion?: number;
    reasoning: boolean;
    vision: boolean;
    imageGeneration: boolean;
    tools: boolean;
    structuredOutputs: boolean;
    streaming: boolean;
    files: boolean;
  };
};
export type Memory = {
  id: string;
  scope: string;
  content: string;
  enabled: number | boolean;
  project_id?: string;
  conversation_id?: string;
};
export type UsageRow = {
  provider: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  cached_tokens: number;
  cost_usd: number;
  requests: number;
  estimated?: boolean;
  priced?: boolean;
};
export type WorkspaceData = {
  user: { id: string; email?: string; name?: string };
  folders: Array<{ id: string; name: string }>;
  projects: Project[];
  conversations: Conversation[];
  providers: Provider[];
  memories: Memory[];
  usage: UsageRow[];
  monthlyUsage: UsageRow[];
  settings: Record<string, unknown>;
  messages: Message[];
  files: ProjectFile[];
  changes: Change[];
  activity: ActivityEvent[];
  checkpoints: Checkpoint[];
};
