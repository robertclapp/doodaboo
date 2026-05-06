"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { nanoid } from "nanoid";
import {
  ActivityEntry,
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
  seedLabels,
  seedPosts,
  seedProjects,
  seedTasks,
  seedUsers,
} from "./seed";

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

interface StoreState {
  hydrated: boolean;
  currentUserId: string;
  users: User[];
  labels: Label[];
  projects: Project[];
  tasks: Task[];
  posts: Post[];

  // hydration
  setHydrated: (v: boolean) => void;
  resetToSeed: () => void;
  exportState: () => ExportPayload;
  importState: (payload: ExportPayload) => void;

  // user
  setCurrentUser: (id: string) => void;
  addUser: (u: Omit<User, "id">) => User;
  removeUser: (id: string) => void;

  // labels
  addLabel: (l: Omit<Label, "id">) => Label;
  removeLabel: (id: string) => void;

  // projects
  createProject: (
    data: Partial<Project> & Pick<Project, "name" | "key">,
  ) => Project;
  updateProject: (id: string, patch: Partial<Project>) => void;
  deleteProject: (id: string) => void;

  // tasks
  createTask: (
    data: Partial<Task> & Pick<Task, "projectId" | "title">,
  ) => Task;
  updateTask: (id: string, patch: Partial<Task>) => void;
  deleteTask: (id: string) => void;
  moveTaskStatus: (id: string, status: Status) => void;
  addComment: (taskId: string, body: string) => Comment | undefined;

  // posts
  createPost: (data: Partial<Post> & Pick<Post, "title" | "platform">) => Post;
  updatePost: (id: string, patch: Partial<Post>) => void;
  deletePost: (id: string) => void;
  addSnapshot: (
    postId: string,
    snapshot: Omit<EngagementSnapshot, "id" | "capturedAt">,
  ) => EngagementSnapshot | undefined;
  removeSnapshot: (postId: string, snapshotId: string) => void;
}

const nowIso = () => new Date().toISOString();

export const useStore = create<StoreState>()(
  persist(
    (set, get) => ({
      hydrated: false,
      currentUserId: seedUsers[0].id,
      users: seedUsers,
      labels: seedLabels,
      projects: seedProjects,
      tasks: seedTasks,
      posts: seedPosts,

      setHydrated: (v) => set({ hydrated: v }),
      resetToSeed: () =>
        set({
          currentUserId: seedUsers[0].id,
          users: seedUsers,
          labels: seedLabels,
          projects: seedProjects,
          tasks: seedTasks,
          posts: seedPosts,
        }),
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

      setCurrentUser: (id) => set({ currentUserId: id }),
      addUser: (u) => {
        const user: User = { id: `u_${nanoid(6)}`, ...u };
        set((s) => ({ users: [...s.users, user] }));
        return user;
      },
      removeUser: (id) =>
        set((s) => ({
          users: s.users.filter((u) => u.id !== id),
          projects: s.projects.map((p) => ({
            ...p,
            leadId: p.leadId === id ? undefined : p.leadId,
            memberIds: p.memberIds.filter((m) => m !== id),
          })),
          tasks: s.tasks.map((t) => ({
            ...t,
            assigneeId: t.assigneeId === id ? undefined : t.assigneeId,
          })),
        })),

      addLabel: (l) => {
        const label: Label = { id: `l_${nanoid(6)}`, ...l };
        set((s) => ({ labels: [...s.labels, label] }));
        return label;
      },
      removeLabel: (id) =>
        set((s) => ({
          labels: s.labels.filter((l) => l.id !== id),
          tasks: s.tasks.map((t) => ({
            ...t,
            labelIds: t.labelIds.filter((lid) => lid !== id),
          })),
        })),

      createProject: (data) => {
        const project: Project = {
          id: `p_${nanoid(6)}`,
          key: data.key,
          name: data.name,
          description: data.description ?? "",
          status: data.status ?? "todo",
          priority: data.priority ?? "medium",
          leadId: data.leadId ?? get().currentUserId,
          memberIds: data.memberIds ?? [get().currentUserId],
          targetDate: data.targetDate,
          icon: data.icon ?? data.name.charAt(0).toUpperCase(),
          accent: data.accent ?? "#ff5c1a",
          createdAt: nowIso(),
          updatedAt: nowIso(),
          nextTaskNumber: 1,
        };
        set((s) => ({ projects: [project, ...s.projects] }));
        return project;
      },
      updateProject: (id, patch) =>
        set((s) => ({
          projects: s.projects.map((p) =>
            p.id === id ? { ...p, ...patch, updatedAt: nowIso() } : p,
          ),
        })),
      deleteProject: (id) =>
        set((s) => ({
          projects: s.projects.filter((p) => p.id !== id),
          tasks: s.tasks.filter((t) => t.projectId !== id),
        })),

      createTask: (data) => {
        const project = get().projects.find((p) => p.id === data.projectId);
        if (!project) {
          throw new Error(`Cannot create task: project ${data.projectId} not found`);
        }
        const number = project.nextTaskNumber;
        const task: Task = {
          id: `t_${nanoid(6)}`,
          projectId: data.projectId,
          number,
          type: data.type ?? "task",
          title: data.title,
          description: data.description ?? "",
          status: data.status ?? "todo",
          priority: data.priority ?? "medium",
          assigneeId: data.assigneeId,
          labelIds: data.labelIds ?? [],
          dueDate: data.dueDate,
          estimate: data.estimate,
          createdAt: nowIso(),
          updatedAt: nowIso(),
          comments: [],
          activity: [
            {
              id: nanoid(6),
              at: nowIso(),
              authorId: get().currentUserId,
              message: `Created ${data.type ?? "task"}`,
            },
          ],
        };
        set((s) => ({
          tasks: [task, ...s.tasks],
          projects: s.projects.map((p) =>
            p.id === data.projectId
              ? { ...p, nextTaskNumber: p.nextTaskNumber + 1 }
              : p,
          ),
        }));
        return task;
      },
      updateTask: (id, patch) =>
        set((s) => {
          const existing = s.tasks.find((t) => t.id === id);
          if (!existing) return { tasks: s.tasks };
          const entries: ActivityEntry[] = [];
          if (patch.status && patch.status !== existing.status) {
            entries.push({
              id: nanoid(6),
              at: nowIso(),
              authorId: s.currentUserId,
              message: `Status → ${patch.status.replace("_", " ")}`,
            });
          }
          if (patch.priority && patch.priority !== existing.priority) {
            entries.push({
              id: nanoid(6),
              at: nowIso(),
              authorId: s.currentUserId,
              message: `Priority → ${patch.priority}`,
            });
          }
          if (
            patch.assigneeId !== undefined &&
            patch.assigneeId !== existing.assigneeId
          ) {
            const u = s.users.find((x) => x.id === patch.assigneeId);
            entries.push({
              id: nanoid(6),
              at: nowIso(),
              authorId: s.currentUserId,
              message: u ? `Assigned to @${u.handle}` : "Unassigned",
            });
          }
          return {
            tasks: s.tasks.map((t) =>
              t.id === id
                ? {
                    ...t,
                    ...patch,
                    updatedAt: nowIso(),
                    activity: [...t.activity, ...entries],
                  }
                : t,
            ),
          };
        }),
      deleteTask: (id) =>
        set((s) => ({ tasks: s.tasks.filter((t) => t.id !== id) })),
      moveTaskStatus: (id, status) =>
        get().updateTask(id, { status }),
      createPost: (data) => {
        const post: Post = {
          id: `po_${nanoid(6)}`,
          projectId: data.projectId,
          title: data.title,
          platform: data.platform,
          status: data.status ?? "draft",
          scheduledAt: data.scheduledAt,
          postedAt: data.postedAt,
          threshold: data.threshold ?? {
            metric: "views",
            value: 100000,
            window: "7d",
          },
          snapshots: data.snapshots ?? [],
          content: data.content ?? {
            hook: "",
            caption: "",
            hashtags: [],
            transcript: "",
            format: "video",
            durationSec: undefined,
            hasTrendingAudio: false,
          },
          context: data.context ?? {
            audienceSize: 1000,
            accountAvgViews: 200,
            postingHour: 12,
            dayOfWeek: 2,
            topicCategory: "general",
            novelty: 3,
            emotion: 3,
            trendMatch: 3,
            sentiment: "neutral",
          },
          createdAt: nowIso(),
          updatedAt: nowIso(),
        };
        set((s) => ({ posts: [post, ...s.posts] }));
        return post;
      },
      updatePost: (id, patch) =>
        set((s) => ({
          posts: s.posts.map((p) =>
            p.id === id ? { ...p, ...patch, updatedAt: nowIso() } : p,
          ),
        })),
      deletePost: (id) =>
        set((s) => ({ posts: s.posts.filter((p) => p.id !== id) })),
      addSnapshot: (postId, snapshot) => {
        const snap: EngagementSnapshot = {
          id: nanoid(6),
          capturedAt: nowIso(),
          ...snapshot,
        };
        set((s) => ({
          posts: s.posts.map((p) =>
            p.id === postId
              ? {
                  ...p,
                  snapshots: [...p.snapshots, snap].sort(
                    (a, b) => a.atMinutes - b.atMinutes,
                  ),
                  updatedAt: nowIso(),
                }
              : p,
          ),
        }));
        return snap;
      },
      removeSnapshot: (postId, snapshotId) =>
        set((s) => ({
          posts: s.posts.map((p) =>
            p.id === postId
              ? {
                  ...p,
                  snapshots: p.snapshots.filter((x) => x.id !== snapshotId),
                  updatedAt: nowIso(),
                }
              : p,
          ),
        })),

      addComment: (taskId, body) => {
        const clean = body.trim();
        if (!clean) return undefined;
        const c: Comment = {
          id: nanoid(6),
          authorId: get().currentUserId,
          body: clean,
          createdAt: nowIso(),
        };
        set((s) => ({
          tasks: s.tasks.map((t) =>
            t.id === taskId
              ? {
                  ...t,
                  comments: [...t.comments, c],
                  activity: [
                    ...t.activity,
                    {
                      id: nanoid(6),
                      at: nowIso(),
                      authorId: s.currentUserId,
                      message: "Commented",
                    },
                  ],
                }
              : t,
          ),
        }));
        return c;
      },
    }),
    {
      name: "doodaboo-v1",
      // Skip automatic rehydration so server and client both start from
      // seed state; client explicitly rehydrates in <StoreHydration />
      // after mount, avoiding React hydration mismatches.
      skipHydration: true,
      storage: createJSONStorage(() =>
        typeof window === "undefined"
          ? (undefined as unknown as Storage)
          : window.localStorage,
      ),
      partialize: (s) => ({
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

// Helpers
export const selectProject = (id: string) => (s: StoreState) =>
  s.projects.find((p) => p.id === id);

export const selectTasksForProject = (projectId: string) => (s: StoreState) =>
  s.tasks.filter((t) => t.projectId === projectId);

export const selectUser = (id?: string) => (s: StoreState) =>
  id ? s.users.find((u) => u.id === id) : undefined;
