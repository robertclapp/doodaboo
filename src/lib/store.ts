"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { createTauriStorage, isTauri } from "./tauri-storage";
import { demoPostsEnabled } from "./seed";
import { CLOUD_PREFS_KEY, isCloud } from "./backend";
import { deepEqual } from "./deep-equal";
import { Op, toWirePatch } from "./ops";
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

/**
 * What the cloud layer plugs into the store when a workspace is live.
 *
 * In cloud mode the store is a mirror of the Convex `workspace.get` query:
 * reads come from `ingestCloudView`, and every write goes through
 * `apply`, which returns the op's result synchronously (the created record,
 * computed locally with the same seed the server will replay) while the
 * mutation is in flight. See src/lib/ops.ts and
 * src/components/cloud/WorkspaceSync.tsx.
 */
export interface CloudBridge {
  workspaceId: string;
  workspaceName: string;
  role: "owner" | "member";
  account: { email: string | null; userId: string };
  apply: (op: Op) => unknown;
  /** Replace all content (owner only) — Settings → Import in cloud mode. */
  replaceContent: (payload: ExportPayload) => Promise<void>;
  switchWorkspace: () => void;
  signOut: () => Promise<void>;
}

/** The reactive read model the cloud layer feeds in. */
export interface CloudView {
  id: string;
  name: string;
  role: "owner" | "member";
  state: WorkspaceState;
}

interface StoreState extends WorkspaceState {
  hydrated: boolean;
  /** Non-null while a cloud workspace is mirrored into this store. */
  cloud: CloudBridge | null;

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

/**
 * Route a write: through the cloud bridge when a workspace is live, else
 * through the local pure mutation. The bridge returns the same result type
 * the local path does, so callers never know which one ran.
 */
function route<T>(get: () => StoreState, op: Op, local: () => T): T {
  const bridge = get().cloud;
  return bridge ? (bridge.apply(op) as T) : local();
}

/** Actions that only make sense for a device-local workspace. */
function assertLocal(get: () => StoreState, what: string): void {
  if (get().cloud) {
    throw new Error(`${what} is not available in cloud mode; manage the workspace from Settings → Cloud`);
  }
}

// Decided once per page load: a cloud build with a valid deployment URL and
// no device override. In cloud mode the store starts empty, is never persisted
// to the local vault (only the theme is, under its own key), and is filled by
// the reactive query. See src/lib/backend.ts.
const cloudMode = isCloud();

// Fresh workspaces honor the NEXT_PUBLIC_DEMO_POSTS flag (inlined at
// build time in both the server and client bundles, so SSR and CSR
// agree). The pure mutation layer stays deterministic — the env read
// happens only here, at the web entry point.
const seed: WorkspaceState = cloudMode
  ? { ...blankWorkspace(), users: [], currentUserId: "" }
  : emptyWorkspace({ demoPosts: demoPostsEnabled() });

export const useStore = create<StoreState>()(
  persist(
    (set, get) => ({
      ...seed,
      hydrated: false,
      cloud: null,

      setHydrated: (v) => set({ hydrated: v }),
      // Theme is a device preference in both modes; never an op.
      setTheme: (theme) => apply(set, get, (s) => setThemeMut(s, theme)),
      // "Reset to demo data" is an explicit request for the demo, so it
      // always includes demo posts regardless of the fresh-account flag.
      resetToSeed: () => {
        assertLocal(get, "Reset to demo data");
        set({ ...emptyWorkspace({ demoPosts: true }) });
      },
      // Starting blank wipes content, not preferences — keep the theme.
      resetToBlank: () => {
        assertLocal(get, "Start blank workspace");
        set({ ...blankWorkspace(), theme: get().theme });
      },
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
        assertLocal(get, "Import");
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

      setCurrentUser: (id) => {
        assertLocal(get, "Switching the active user");
        apply(set, get, (s) => setCurrentUserMut(s, id));
      },
      addUser: (u) => {
        assertLocal(get, "Adding a member");
        return applyAnd(set, get, (s) => addUserAdapter(s, u));
      },
      removeUser: (id) => {
        assertLocal(get, "Removing a member");
        apply(set, get, (s) => removeUserMut(s, id));
      },

      addLabel: (l) =>
        route(get, { type: "addLabel", data: l }, () =>
          applyAnd(set, get, (s) => addLabelAdapter(s, l)),
        ),
      removeLabel: (id) =>
        route(get, { type: "removeLabel", id }, () =>
          apply(set, get, (s) => removeLabelMut(s, id)),
        ),

      createProject: (data) =>
        route(get, { type: "createProject", data }, () =>
          applyAnd(set, get, (s) => createProjectAdapter(s, data)),
        ),
      updateProject: (id, patch) =>
        route(get, { type: "updateProject", id, ...toWirePatch(patch) }, () =>
          apply(set, get, (s) => updateProjectMut(s, id, patch)),
        ),
      deleteProject: (id) =>
        route(get, { type: "deleteProject", id }, () =>
          apply(set, get, (s) => deleteProjectMut(s, id)),
        ),
      restoreProject: (snapshot) =>
        route(get, { type: "restoreProject", id: snapshot.project.id }, () =>
          apply(set, get, (s) => restoreProjectMut(s, snapshot)),
        ),

      createTask: (data) =>
        route(get, { type: "createTask", data }, () =>
          applyAnd(set, get, (s) => createTaskAdapter(s, data)),
        ),
      updateTask: (id, patch) =>
        route(get, { type: "updateTask", id, ...toWirePatch(patch) }, () =>
          apply(set, get, (s) => updateTaskMut(s, id, patch)),
        ),
      deleteTask: (id) =>
        route(get, { type: "deleteTask", id }, () =>
          apply(set, get, (s) => deleteTaskMut(s, id)),
        ),
      restoreTask: (snapshot) =>
        route(get, { type: "restoreTask", id: snapshot.id }, () =>
          apply(set, get, (s) => restoreTaskMut(s, snapshot)),
        ),
      moveTaskStatus: (id, status) =>
        route(get, { type: "moveTaskStatus", id, status }, () =>
          apply(set, get, (s) => moveTaskStatusMut(s, id, status)),
        ),
      addComment: (taskId, body) =>
        route(get, { type: "addComment", taskId, body }, () => {
          const r = addCommentMut(extract(get()), taskId, body);
          set(r.state as Partial<StoreState>);
          return r.comment;
        }),

      createPost: (data) =>
        route(get, { type: "createPost", data }, () =>
          applyAnd(set, get, (s) => createPostAdapter(s, data)),
        ),
      updatePost: (id, patch) =>
        route(get, { type: "updatePost", id, ...toWirePatch(patch) }, () =>
          apply(set, get, (s) => updatePostMut(s, id, patch)),
        ),
      deletePost: (id) =>
        route(get, { type: "deletePost", id }, () =>
          apply(set, get, (s) => deletePostMut(s, id)),
        ),
      restorePost: (snapshot) =>
        route(get, { type: "restorePost", id: snapshot.id }, () =>
          apply(set, get, (s) => restorePostMut(s, snapshot)),
        ),
      duplicatePost: (id, opts) =>
        route(
          get,
          { type: "duplicatePost", id, ...(opts?.titleSuffix !== undefined ? { titleSuffix: opts.titleSuffix } : {}) },
          () => {
            const r = duplicatePostMut(extract(get()), id, opts);
            set(r.state as Partial<StoreState>);
            return r.post;
          },
        ),
      addSnapshot: (postId, snapshot) =>
        route(get, { type: "addSnapshot", postId, snapshot }, () => {
          const r = addSnapshotMut(extract(get()), postId, snapshot);
          set(r.state as Partial<StoreState>);
          return r.snapshot;
        }),
      removeSnapshot: (postId, snapshotId) =>
        route(get, { type: "removeSnapshot", postId, snapshotId }, () =>
          apply(set, get, (s) => removeSnapshotMut(s, postId, snapshotId)),
        ),
    }),
    {
      // Local mode persists the workspace under the vault key. Cloud mode
      // persists only the theme, under its own key, so a cloud session can
      // never overwrite the device's local workspace (or, inside Tauri, the
      // on-disk vault the CLI shares).
      name: cloudMode ? CLOUD_PREFS_KEY : "doodaboo-v1",
      skipHydration: true,
      // Inside Tauri's webview, local-mode persistence routes through Rust
      // commands so the desktop app reads/writes the on-disk vault
      // directly. On the web, it falls back to localStorage.
      storage:
        !cloudMode && isTauri()
          ? createTauriStorage()
          : createJSONStorage(() =>
              typeof window === "undefined"
                ? (undefined as unknown as Storage)
                : window.localStorage,
            ),
      partialize: (s) =>
        cloudMode
          ? { theme: s.theme }
          : {
              theme: s.theme,
              currentUserId: s.currentUserId,
              users: s.users,
              labels: s.labels,
              projects: s.projects,
              tasks: s.tasks,
              posts: s.posts,
            },
      merge: (persisted, current) =>
        cloudMode
          ? { ...current, theme: (persisted as { theme?: Theme } | undefined)?.theme ?? current.theme }
          : { ...current, ...(persisted as Partial<StoreState>) },
      onRehydrateStorage: () => (state) => {
        // In cloud mode `hydrated` means "the store mirrors a workspace";
        // WorkspaceSync flips it after the first query result.
        if (!cloudMode) state?.setHydrated(true);
      },
    },
  ),
);

/**
 * Feed a `workspace.get` result into the store. Records that did not change
 * keep their object identity (and an unchanged collection keeps its array),
 * so selectors across the app do not re-render on every remote edit. The
 * device's theme is kept; the server's "system" placeholder is ignored.
 */
export function ingestCloudView(view: CloudView): void {
  const prev = useStore.getState();
  const next = view.state;
  useStore.setState({
    currentUserId: next.currentUserId,
    users: share(prev.users, next.users),
    labels: share(prev.labels, next.labels),
    projects: share(prev.projects, next.projects),
    tasks: share(prev.tasks, next.tasks),
    posts: share(prev.posts, next.posts),
    hydrated: true,
  });
}

function share<T extends { id: string }>(prev: T[], next: T[]): T[] {
  const byId = new Map(prev.map((r) => [r.id, r]));
  let unchanged = prev.length === next.length;
  const out = next.map((r, i) => {
    const old = byId.get(r.id);
    if (old && deepEqual(old, r)) {
      if (prev[i] !== old) unchanged = false;
      return old;
    }
    unchanged = false;
    return r;
  });
  return unchanged ? prev : out;
}

/** Leave cloud mode's mirror (sign-out, workspace switch, account change). */
export function clearCloudWorkspace(): void {
  useStore.setState({
    ...blankWorkspace(),
    users: [],
    currentUserId: "",
    theme: useStore.getState().theme,
    hydrated: false,
    cloud: null,
  });
}

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
