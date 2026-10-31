import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  connectionStatus,
  FIRST_CONNECT_GRACE_MS,
  RECONNECT_RETRY_THRESHOLD,
} from "./connection-status";

const base = { isWebSocketConnected: true, hasEverConnected: true, connectionRetries: 0, inflightMutations: 0 };

describe("connectionStatus", () => {
  it("is quiet while connected with nothing pending", () => {
    assert.deepEqual(connectionStatus(base, 0), { kind: "ok" });
  });

  it("reports queued mutations while connected", () => {
    assert.deepEqual(connectionStatus({ ...base, inflightMutations: 2 }, 0), { kind: "pending", count: 2 });
  });

  it("gives a first connection a grace period before calling it unreachable", () => {
    const fresh = { ...base, isWebSocketConnected: false, hasEverConnected: false };
    assert.deepEqual(connectionStatus(fresh, FIRST_CONNECT_GRACE_MS - 1), { kind: "ok" });
    assert.deepEqual(connectionStatus(fresh, FIRST_CONNECT_GRACE_MS), { kind: "unreachable", retries: 0 });
    assert.deepEqual(connectionStatus({ ...fresh, connectionRetries: RECONNECT_RETRY_THRESHOLD }, 0), {
      kind: "unreachable",
      retries: RECONNECT_RETRY_THRESHOLD,
    });
  });

  it("after a drop, waits for the client's retries before alarming", () => {
    const dropped = { ...base, isWebSocketConnected: false };
    assert.deepEqual(connectionStatus({ ...dropped, connectionRetries: 1 }, 60_000), { kind: "ok" });
    assert.deepEqual(connectionStatus({ ...dropped, connectionRetries: 1, inflightMutations: 1 }, 60_000), {
      kind: "pending",
      count: 1,
    });
    assert.deepEqual(connectionStatus({ ...dropped, connectionRetries: RECONNECT_RETRY_THRESHOLD }, 60_000), {
      kind: "unreachable",
      retries: RECONNECT_RETRY_THRESHOLD,
    });
  });
});
