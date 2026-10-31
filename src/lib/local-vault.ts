"use client";

import { isTauri } from "./tauri-storage";
import type { WorkspaceState } from "./mutations";

/**
 * Read the device's local workspace directly from where local mode keeps
 * it — never from the store, which in cloud mode mirrors a cloud workspace.
 * Used by "Upload this device's local workspace" in the workspace picker.
 */
export async function readLocalWorkspace(): Promise<WorkspaceState | null> {
  try {
    if (isTauri()) {
      const { invoke } = (await import("@tauri-apps/api/core")) as {
        invoke: <T>(cmd: string) => Promise<T>;
      };
      return validate(await invoke<unknown>("vault_load"));
    }
    const raw = window.localStorage.getItem("doodaboo-v1");
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { state?: unknown };
    return validate(parsed.state);
  } catch {
    return null;
  }
}

function validate(value: unknown): WorkspaceState | null {
  if (!value || typeof value !== "object") return null;
  const s = value as Partial<WorkspaceState>;
  if (
    !Array.isArray(s.labels) ||
    !Array.isArray(s.projects) ||
    !Array.isArray(s.tasks)
  ) {
    return null;
  }
  return {
    version: 1,
    theme: "system",
    currentUserId: typeof s.currentUserId === "string" ? s.currentUserId : "",
    users: Array.isArray(s.users) ? s.users : [],
    labels: s.labels,
    projects: s.projects,
    tasks: s.tasks,
    posts: Array.isArray(s.posts) ? s.posts : [],
  };
}

/** Something worth uploading: at least one project, task, label or post. */
export function hasContent(state: WorkspaceState | null): state is WorkspaceState {
  return (
    !!state &&
    state.projects.length + state.tasks.length + state.labels.length + state.posts.length > 0
  );
}
