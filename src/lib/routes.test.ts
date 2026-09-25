import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ID_PARAM, ID_PATTERNS, ROUTE_PATHS, routes } from "./routes";

describe("routes — record detail URLs use a static path + id query", () => {
  it("builds each detail URL from its static view path", () => {
    assert.equal(routes.post("po_x"), `${ROUTE_PATHS.post}?${ID_PARAM}=po_x`);
    assert.equal(routes.project("p_x"), `${ROUTE_PATHS.project}?${ID_PARAM}=p_x`);
    assert.equal(routes.task("t_x"), `${ROUTE_PATHS.task}?${ID_PARAM}=t_x`);
    assert.equal(routes.playbook("pb_x"), `${ROUTE_PATHS.playbook}?${ID_PARAM}=pb_x`);
  });

  it("never puts a runtime id in the path segment", () => {
    // The whole point: every path the app requests must be a file that
    // exists in the static export, or Tauri's resolver falls back to the
    // dashboard. The id must live only after the '?'.
    for (const url of [routes.post("po_x"), routes.project("p_x"), routes.task("t_x"), routes.playbook("pb_x")]) {
      const [path, query] = url.split("?");
      assert.ok(Object.values(ROUTE_PATHS).includes(path as never), `${path} is not a static view path`);
      assert.match(query, new RegExp(`^${ID_PARAM}=`));
    }
  });

  it("URL-encodes ids so an odd id cannot break the query", () => {
    assert.equal(routes.post("a b&c"), `${ROUTE_PATHS.post}?${ID_PARAM}=a%20b%26c`);
  });

  it("compare joins ids and omits the query when empty", () => {
    assert.equal(routes.compare(["po_a", "po_b"]), "/posts/compare?ids=po_a,po_b");
    assert.equal(routes.compare([]), "/posts/compare");
    assert.equal(routes.compare(), "/posts/compare");
  });
});

describe("ID_PATTERNS — what the legacy web redirects may match", () => {
  const re = (p: string) => new RegExp(`^${p}$`);

  it("match seed and nanoid-shaped ids", () => {
    assert.match("po_brutalist_drop", re(ID_PATTERNS.post));
    assert.match("po_V1StGXR8_Z5jdHi6B-myT", re(ID_PATTERNS.post)); // nanoid alphabet
    assert.match("p_web", re(ID_PATTERNS.project));
    assert.match("t_p_web_1", re(ID_PATTERNS.task));
    assert.match("pb_3s_hook", re(ID_PATTERNS.playbook));
  });

  it("do not match the static route names that share a prefix directory", () => {
    // These live under the same parent as the id routes on the web
    // (/posts/new, /projects/new, /posts/view, …). A redirect that caught
    // them would break the app, so the prefix is the guard.
    for (const name of ["new", "view", "lab", "insights", "compare"]) {
      assert.doesNotMatch(name, re(ID_PATTERNS.post), `post pattern matched "${name}"`);
      assert.doesNotMatch(name, re(ID_PATTERNS.project), `project pattern matched "${name}"`);
      assert.doesNotMatch(name, re(ID_PATTERNS.playbook), `playbook pattern matched "${name}"`);
    }
  });

  it("each pattern is specific to its own prefix", () => {
    assert.doesNotMatch("po_x", re(ID_PATTERNS.project));
    assert.doesNotMatch("pb_x", re(ID_PATTERNS.post));
    assert.doesNotMatch("t_x", re(ID_PATTERNS.project));
  });
});
