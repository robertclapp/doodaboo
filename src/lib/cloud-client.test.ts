import "./test-memory-window";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { ConvexError } from "convex/values";
import { deepEqual } from "./deep-equal";
import { ingestCloudView, useStore } from "./store";
import { emptyWorkspace, updateTask } from "./mutations";
import { normalizeContent } from "./normalize-content";
import { messageOf } from "./cloud-bridge";
import { parseInviteInput } from "../components/cloud/invite-links";

describe("deepEqual", () => {
  it("treats undefined as absent and null as a value, symmetrically", () => {
    assert.equal(deepEqual({ a: 1, b: undefined }, { a: 1 }), true);
    assert.equal(deepEqual({ a: 1 }, { a: 1, b: undefined }), true);
    assert.equal(deepEqual({ x: null }, {}), false);
    assert.equal(deepEqual({}, { x: null }), false);
    assert.equal(deepEqual(null, undefined), false);
    assert.equal(deepEqual([1, { a: [2] }], [1, { a: [2] }]), true);
    assert.equal(deepEqual([1, 2], [2, 1]), false);
  });
});

describe("ingestCloudView keeps identity for unchanged data", () => {
  it("unchanged records and collections keep their objects; changed ones are replaced", () => {
    const base = emptyWorkspace({ demoPosts: true });
    const view = (state: typeof base) => ({ id: "w", name: "W", role: "owner" as const, state, truncated: [] });
    ingestCloudView(view(base));
    const first = useStore.getState();
    // A structurally identical push (new objects, same content) changes nothing.
    ingestCloudView(view(JSON.parse(JSON.stringify(base))));
    const second = useStore.getState();
    assert.equal(second.tasks, first.tasks);
    assert.equal(second.projects, first.projects);
    // One task edited: only it is new; the others keep identity.
    const edited = updateTask(base, base.tasks[0].id, { title: "edited" });
    ingestCloudView(view(JSON.parse(JSON.stringify(edited))));
    const third = useStore.getState();
    assert.notEqual(third.tasks, second.tasks);
    assert.notEqual(third.tasks[0], second.tasks[0]);
    assert.equal(third.tasks[1], second.tasks[1]);
    assert.equal(third.projects, second.projects);
    assert.equal(third.hydrated, true);
  });
});

describe("normalizeContent", () => {
  it("strips fields the cloud does not accept and drops nulls, as API-edited vaults carry them", () => {
    const base = emptyWorkspace({ demoPosts: true });
    const dirtyTask = { ...base.tasks[0], comment: "from PATCH {comment}", assigneeId: null };
    const dirtyPost = { ...base.posts[0], extra: 1, content: { ...base.posts[0].content, junk: true } };
    const out = normalizeContent({
      labels: base.labels,
      projects: base.projects,
      tasks: [dirtyTask as never, ...base.tasks.slice(1)],
      posts: [dirtyPost as never],
    });
    assert.equal("comment" in out.tasks[0], false);
    assert.equal("assigneeId" in out.tasks[0], false);
    assert.equal("extra" in out.posts[0], false);
    assert.equal("junk" in out.posts[0].content, false);
    // Clean records pass through unchanged.
    assert.deepEqual(out.tasks[1], base.tasks[1]);
    assert.deepEqual(out.projects, base.projects);
  });
});

describe("parseInviteInput", () => {
  const token = "AbCdEfGhIjKlMnOpQrStUvWxYz012345";
  it("accepts a link with the token in the fragment or the query, or the bare code", () => {
    assert.equal(parseInviteInput(`https://app.example.com/join#token=${token}`), token);
    assert.equal(parseInviteInput(`https://app.example.com/join?token=${token}`), token);
    assert.equal(parseInviteInput(`  ${token}  `), token);
  });
  it("rejects anything else", () => {
    assert.equal(parseInviteInput(""), null);
    assert.equal(parseInviteInput("hello"), null);
    assert.equal(parseInviteInput("https://app.example.com/join"), null);
  });
});

describe("messageOf", () => {
  it("shows ConvexError data as is", () => {
    assert.equal(messageOf(new ConvexError({ code: "Forbidden", message: "Only a workspace owner can do that" })), "Only a workspace owner can do that");
    assert.equal(messageOf(new ConvexError("Wrong email or password")), "Wrong email or password");
  });
  it("strips the Convex transport framing and replaces a redacted server error with a sentence", () => {
    const redacted = new Error("[CONVEX M(workspace:apply)] [Request ID: 1a2b3c] Server Error\n  Called by client");
    assert.match(messageOf(redacted), /could not complete that/);
    const dev = new Error("[CONVEX M(workspace:apply)] [Request ID: 1a2b3c] Server Error\nUncaught Error: Task t_x not found\n    at handler\n  Called by client");
    assert.equal(messageOf(dev), "Task t_x not found");
  });
});

describe("next.config.mjs refuses an unusable deployment URL", () => {
  const load = (url: string) =>
    spawnSync(process.execPath, ["-e", "import('./next.config.mjs').then(() => console.log('ok'), (e) => { console.error(e.message); process.exit(3) })"], {
      cwd: path.resolve(__dirname, "..", ".."),
      env: { ...process.env, NEXT_PUBLIC_CONVEX_URL: url },
      encoding: "utf8",
    });
  it("loads with a deployment URL or none", () => {
    assert.equal(load("https://happy-otter-123.convex.cloud").status, 0);
    assert.equal(load("").status, 0);
  });
  it("throws for a malformed URL or the .convex.site host", () => {
    for (const bad of ["happy-otter-123.convex.cloud", "https://happy-otter-123.convex.site"]) {
      const r = load(bad);
      assert.equal(r.status, 3, `${bad} should fail`);
      assert.match(r.stderr, /not a usable Convex deployment URL/);
    }
  });
});
