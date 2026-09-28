"use client";
import { Toaster } from "@/components/ui/sonner";
import { WorkspaceShell } from "./workspace-shell";
import { PwaRegister } from "./pwa-register";
export function WorkspaceApp() {
  return (
    <>
      <PwaRegister />
      <WorkspaceShell />
      <Toaster richColors position="top-center" />
    </>
  );
}
