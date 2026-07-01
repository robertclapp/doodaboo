"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { createTauriStorage, isTauri } from "./tauri-storage";
import {
  Comment,
  EngagementSnapshot,
  Label,
  Post,
  Project,
  Status,
  Task,
  User,
} from "./types";
import {
  addComment as addCommentMut,
  addLabel as addLabelMut,
  addSnapshot as addSnapshotMut,
  addUser as addUserMut,
  blankWorkspace,
  createPost as createPostMut,
  createProject as createProjectMut,
  createTask as createTaskMut,
  deletePost as deletePostMut,
  deleteProject as deleteProjectMut,
  deleteTask as deleteTaskMut,
  duplicatePost as duplicatePostMut,
  emptyWorkspace,
  moveTaskStatus as moveTaskStatusMut,
  ProjectSnapshot,
  removeLabel as removeLabelMut,
  removeSnapshot as removeSnapshotMut,
  removeUser as removeUserMut,
  restorePost as restorePostMut,
  restoreProject as restoreProjectMut,
  restoreTask as restoreTaskMut,
  setCurrentUser as setCurrentUserMut,
  setTheme as setThemeMut,
  Theme,
  updatePost as updatePostMut,
  updateProject as updateProjectMut,
  updateTask as updateTaskMut,
  WorkspaceState,
  WORKSPACE_VERSION,
} from "./mutations";

export type { ProjectSnapshot } from "./mutations";

export type { Theme } from "./mutations";

const EXPORT_VERSION = 1;

export interface ExportPayload {
  version: number;
  exportedAt: string;
  users: User[];
  labels: Label[];
  projects: Project[];
  tasks: Task[];
  posts: Post[];
  currentUserId?: string;
}

interface StoreState extends WorkspaceState {
  hydrated: boolean;

  setHydrated: (v: boolean) => void;
  setTheme: (t: Theme) => void;
  resetToSeed: () => void;
  resetToBlank: () => void;
  exportState: () => ExportPayload;
  importState: (payload: ExportPayload) => void;

  setCurrentUser: (id: string) => void;
  addUser: (u: Omit<User, "id">) => User;
  removeUser: (id: string) => void;

  addLabel: (l: Omit<Label, "id">) => Label;
  removeLabel: (id: string) => void;

  createProject: (
    data: Partial<Project> & Pick<Project, "name" | "key">,
  ) => Project;
  updateProject: (id: string, patch: Partial<Project>) => void;
  deleteProject: (id: string) => void;
  restoreProject: (snapshot: ProjectSnapshot) => void;

  createTask: (
    data: Partial<Task> & Pick<Task, "projectId" | "title">,
  ) => Task;
  updateTask: (id: string, patch: Partial<Task>) => void;
  deleteTask: (id: string) => void;
  restoreTask: (snapshot: Task) => void;
  moveTaskStatus: (id: string, status: Status) => void;
  addComment: (taskId: string, body: string) => Comment | undefined;

  createPost: (data: Partial<Post> & Pick<Post, "title" | "platform">) => Post;
  updatePost: (id: string, patch: Partial<Post>) => void;
  deletePost: (id: string) => void;
  restorePost: (snapshot: Post) => void;
  duplicatePost: (
    id: string,
    opts?: { titleSuffix?: string },
  ) => Post | undefined;
  addSnapshot: (
    postId: string,
    snapshot: Omit<EngagementSnapshot, "id" | "capturedAt">,
  ) => EngagementSnapshot | undefined;
  removeSnapshot: (postId: string, snapshotId: string) => void;
}

/** Apply a pure mutation that returns just the new WorkspaceState. */
function apply(
  set: (s: Partial<StoreState>) => void,
  get: () => StoreState,
  fn: (state: WorkspaceState) => WorkspaceState,
): void {
  set(fn(extract(get())) as Partial<StoreState>);
}

/** Apply a pure mutation that returns { state, result } and bubble result. */
function applyAnd<T>(
  set: (s: Partial<StoreState>) => void,
  get: () => StoreState,
  fn: (state: WorkspaceState) => { state: WorkspaceState; result: T },
): T {
  const r = fn(extract(get()));
  set(r.state as Partial<StoreState>);
  return r.result;
}

/** Pull the bare WorkspaceState out of the merged StoreState. */
function extract(s: StoreState): WorkspaceState {
  return {
    version: WORKSPACE_VERSION,
    theme: s.theme,
    currentUserId: s.currentUserId,
    users: s.users,
    labels: s.labels,
    projects: s.projects,
    tasks: s.tasks,
    posts: s.posts,
  };
}

const seed = emptyWorkspace();

export const useStore = create<StoreState>()(
  persist(
    (set, get) => ({
      ...seed,
      hydrated: false,

      setHydrated: (v) => set({ hydrated: v }),
      setTheme: (theme) => apply(set, get, (s) => setThemeMut(s, theme)),
      resetToSeed: () => set({ ...emptyWorkspace() }),
      resetToBlank: () => set({ ...blankWorkspace() }),
      exportState: () => ({
        version: EXPORT_VERSION,
        exportedAt: new Date().toISOString(),
        users: get().users,
        labels: get().labels,
        projects: get().projects,
        tasks: get().tasks,
        posts: get().posts,
        currentUserId: get().currentUserId,
      }),
      importState: (payload) => {
        if (payload.version !== EXPORT_VERSION) {
          throw new Error(
            `Unsupported export version ${payload.version} (expected ${EXPORT_VERSION})`,
          );
        }
        set({
          users: payload.users,
          labels: payload.labels,
          projects: payload.projects,
          tasks: payload.tasks,
          posts: payload.posts ?? [],
          currentUserId:
            payload.currentUserId &&
            payload.users.some((u) => u.id === payload.currentUserId)
              ? payload.currentUserId
              : payload.users[0]?.id ?? get().currentUserId,
        });
      },

      setCurrentUser: (id) => apply(set, get, (s) => setCurrentUserMut(s, id)),
      addUser: (u) => applyAnd(set, get, (s) => addUserAdapter(s, u)),
      removeUser: (id) => apply(set, get, (s) => removeUserMut(s, id)),

      addLabel: (l) => applyAnd(set, get, (s) => addLabelAdapter(s, l)),
      removeLabel: (id) => apply(set, get, (s) => removeLabelMut(s, id)),

      createProject: (data) =>
        applyAnd(set, get, (s) => createProjectAdapter(s, data)),
      updateProject: (id, patch) =>
        apply(set, get, (s) => updateProjectMut(s, id, patch)),
      deleteProject: (id) => apply(set, get, (s) => deleteProjectMut(s, id)),
      restoreProject: (snapshot) =>
        apply(set, get, (s) => restoreProjectMut(s, snapshot)),

      createTask: (data) =>
        applyAnd(set, get, (s) => createTaskAdapter(s, data)),
      updateTask: (id, patch) =>
        apply(set, get, (s) => updateTaskMut(s, id, patch)),
      deleteTask: (id) => apply(set, get, (s) => deleteTaskMut(s, id)),
      restoreTask: (snapshot) =>
        apply(set, get, (s) => restoreTaskMut(s, snapshot)),
      moveTaskStatus: (id, status) =>
        apply(set, get, (s) => moveTaskStatusMut(s, id, status)),
      addComment: (taskId, body) => {
        const r = addCommentMut(extract(get()), taskId, body);
        set(r.state as Partial<StoreState>);
        return r.comment;
      },

      createPost: (data) =>
        applyAnd(set, get, (s) => createPostAdapter(s, data)),
      updatePost: (id, patch) =>
        apply(set, get, (s) => updatePostMut(s, id, patch)),
      deletePost: (id) => apply(set, get, (s) => deletePostMut(s, id)),
      restorePost: (snapshot) =>
        apply(set, get, (s) => restorePostMut(s, snapshot)),
      duplicatePost: (id, opts) => {
        const r = duplicatePostMut(extract(get()), id, opts);
        set(r.state as Partial<StoreState>);
        return r.post;
      },
      addSnapshot: (postId, snapshot) => {
        const r = addSnapshotMut(extract(get()), postId, snapshot);
        set(r.state as Partial<StoreState>);
        return r.snapshot;
      },
      removeSnapshot: (postId, snapshotId) =>
        apply(set, get, (s) => removeSnapshotMut(s, postId, snapshotId)),
    }),
    {
      name: "doodaboo-v1",
      skipHydration: true,
      // Inside Tauri's webview, persist routes through Rust commands so
      // the desktop app reads/writes the on-disk vault directly. On the
      // web, it falls back to localStorage.
      storage: isTauri()
        ? createTauriStorage()
        : createJSONStorage(() =>
            typeof window === "undefined"
              ? (undefined as unknown as Storage)
              : window.localStorage,
          ),
      partialize: (s) => ({
        theme: s.theme,
        currentUserId: s.currentUserId,
        users: s.users,
        labels: s.labels,
        projects: s.projects,
        tasks: s.tasks,
        posts: s.posts,
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHydrated(true);
      },
    },
  ),
);

// Tiny inline adapters that thread the result tuple cleanly. Keeps the
// store body shaped like the actions object the rest of the app uses.
function addUserAdapter(s: WorkspaceState, u: Omit<User, "id">) {
  const r = addUserMut(s, u);
  return { state: r.state, result: r.user };
}
function addLabelAdapter(s: WorkspaceState, l: Omit<Label, "id">) {
  const r = addLabelMut(s, l);
  return { state: r.state, result: r.label };
}
function createProjectAdapter(
  s: WorkspaceState,
  data: Partial<Project> & Pick<Project, "name" | "key">,
) {
  const r = createProjectMut(s, data);
  return { state: r.state, result: r.project };
}
function createTaskAdapter(
  s: WorkspaceState,
  data: Partial<Task> & Pick<Task, "projectId" | "title">,
) {
  const r = createTaskMut(s, data);
  return { state: r.state, result: r.task };
}
function createPostAdapter(
  s: WorkspaceState,
  data: Partial<Post> & Pick<Post, "title" | "platform">,
) {
  const r = createPostMut(s, data);
  return { state: r.state, result: r.post };
}

// Helpers
export const selectProject = (id: string) => (s: StoreState) =>
  s.projects.find((p) => p.id === id);

export const selectTasksForProject = (projectId: string) => (s: StoreState) =>
  s.tasks.filter((t) => t.projectId === projectId);

export const selectUser = (id?: string) => (s: StoreState) =>
  id ? s.users.find((u) => u.id === id) : undefined;
