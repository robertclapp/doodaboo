/**
 * What the connection banner should say, as a pure function of the Convex
 * client's connection state and how long the page has been up.
 */
export interface ConnectionInput {
  isWebSocketConnected: boolean;
  hasEverConnected: boolean;
  connectionRetries: number;
  inflightMutations: number;
}

export type ConnectionStatus =
  | { kind: "ok" }
  | { kind: "pending"; count: number }
  | { kind: "unreachable"; retries: number };

/** How long a first connection may take before it is called unreachable. */
export const FIRST_CONNECT_GRACE_MS = 8_000;
/** Retries after a drop before the banner appears (the client backs off). */
export const RECONNECT_RETRY_THRESHOLD = 3;

export function connectionStatus(state: ConnectionInput, elapsedMs: number): ConnectionStatus {
  if (state.isWebSocketConnected) {
    return state.inflightMutations > 0 ? { kind: "pending", count: state.inflightMutations } : { kind: "ok" };
  }
  const unreachable = state.hasEverConnected
    ? state.connectionRetries >= RECONNECT_RETRY_THRESHOLD
    : elapsedMs >= FIRST_CONNECT_GRACE_MS || state.connectionRetries >= RECONNECT_RETRY_THRESHOLD;
  if (unreachable) return { kind: "unreachable", retries: state.connectionRetries };
  return state.inflightMutations > 0 ? { kind: "pending", count: state.inflightMutations } : { kind: "ok" };
}
