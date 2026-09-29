import { WorkspaceApp } from "@/components/workspace/workspace-app";
import { requireChatGPTUser } from "@/app/chatgpt-auth";

export const dynamic = "force-dynamic";

export default async function Home() {
  if (process.env.NODE_ENV === "production") {
    await requireChatGPTUser("/");
  }
  return <WorkspaceApp />;
}
