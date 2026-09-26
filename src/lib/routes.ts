/**
 * Every record-detail URL (post, project, task, playbook) is built here, and
 * nowhere else; static page paths are also listed so call sites can share
 * them.
 *
 * Records that exist only at runtime — posts, projects, tasks — are
 * addressed by query string (`/posts/view?id=…`) rather than by path segment
 * (`/posts/<id>`). Playbooks are addressed the same way for uniformity, even
 * though their ids are static.
 *
 * Why: Tauri (desktop and mobile) ships this app as a static export, and a
 * static export can only contain pages whose paths are known at build time.
 * Tauri's asset resolver tries `path`, `path.html`, `path/index.html`, then
 * falls back to the root `index.html` — it never 404s. So under a path
 * scheme, navigating to `/posts/po_x` had the router fetch an RSC payload
 * that fell through to `index.html`, and the *dashboard* rendered at the
 * post's URL (verified in a Chromium probe against that exact chain). With
 * the id in the query, every path the app ever requests — `/posts/view` —
 * is a real exported file, and the resolver strips the query before lookup,
 * so the fallback is never reached. The same URLs serve the web build
 * unchanged, so web, desktop, and mobile run identical routing code.
 *
 * Keeping construction in one module means the shape has a single source of
 * truth that the app, the unit tests, and the Playwright suite all import.
 */

/** Static page paths for the four record-detail views. */
export const ROUTE_PATHS = {
  post: "/posts/view",
  project: "/projects/view",
  task: "/tasks/view",
  playbook: "/playbooks/view",
} as const;

/**
 * Id shapes by record type. nanoid's default alphabet is `A-Za-z0-9_-`, and
 * seed ids (`p_web`, `po_brutalist_drop`, `pb_3s_hook`, `t_p_web_1`) fit the
 * same pattern. The prefixes are what let the web build's legacy-path
 * redirects match `/posts/po_…` without ever catching `/posts/new`,
 * `/posts/lab`, or `/posts/view`.
 */
export const ID_PATTERNS = {
  post: "po_[A-Za-z0-9_-]+",
  project: "p_[A-Za-z0-9_-]+",
  task: "t_[A-Za-z0-9_-]+",
  playbook: "pb_[A-Za-z0-9_-]+",
} as const;

/** Query-string parameter that carries a record id. */
export const ID_PARAM = "id";

function withId(path: string, id: string): string {
  return `${path}?${ID_PARAM}=${encodeURIComponent(id)}`;
}

export const routes = {
  home: "/",
  inbox: "/inbox",
  myIssues: "/my-issues",
  team: "/team",
  labels: "/labels",
  settings: "/settings",

  posts: "/posts",
  newPost: "/posts/new",
  lab: "/posts/lab",
  insights: "/posts/insights",
  post: (id: string): string => withId(ROUTE_PATHS.post, id),
  /** Up to four posts side by side; an empty list opens the picker. */
  compare: (ids: readonly string[] = []): string =>
    ids.length
      ? `/posts/compare?ids=${ids.map(encodeURIComponent).join(",")}`
      : "/posts/compare",

  projects: "/projects",
  newProject: "/projects/new",
  project: (id: string): string => withId(ROUTE_PATHS.project, id),

  /**
   * A task is addressed by its own id only. Its project is derived from
   * `task.projectId` on the page, so the URL can't disagree with the data
   * (the old `/projects/<A>/tasks/<task-from-B>` mismatch is unrepresentable).
   */
  task: (id: string): string => withId(ROUTE_PATHS.task, id),

  playbooks: "/playbooks",
  playbook: (id: string): string => withId(ROUTE_PATHS.playbook, id),
} as const;
