"use client";

import { routes } from "@/lib/routes";

/**
 * Invite links: `<public origin>/join#token=<token>`.
 *
 * The token rides in the URL fragment, which browsers never send to the
 * server, so it does not land in the web host's request logs. `?token=` is
 * still read for links made before the switch.
 */

const TOKEN = /^[A-Za-z0-9_-]{16,128}$/;

export function inviteTokenFromLocation(): string | null {
  if (typeof window === "undefined") return null;
  const fromHash = new URLSearchParams(window.location.hash.replace(/^#/, "")).get("token");
  const fromQuery = new URLSearchParams(window.location.search).get("token");
  const token = fromHash ?? fromQuery;
  return token && TOKEN.test(token) ? token : null;
}

/** Accept a whole invite link or just the code, as pasted. */
export function parseInviteInput(text: string): string | null {
  const raw = text.trim();
  if (!raw) return null;
  if (TOKEN.test(raw)) return raw;
  try {
    const url = new URL(raw);
    const token =
      new URLSearchParams(url.hash.replace(/^#/, "")).get("token") ?? url.searchParams.get("token");
    return token && TOKEN.test(token) ? token : null;
  } catch {
    return null;
  }
}

/**
 * The origin invite links should point at: this page's own origin on the
 * web; inside the desktop/mobile app (tauri://localhost, or
 * http://tauri.localhost on Windows/Android) — which no recipient can open
 * — the configured public site, NEXT_PUBLIC_SITE_URL. Null when there is
 * none: the app then shares the bare code, which the recipient pastes into
 * "Join with an invite" on their workspace picker.
 */
export function shareableOrigin(): string | null {
  if (typeof window !== "undefined") {
    const { protocol, hostname, origin } = window.location;
    if ((protocol === "https:" || protocol === "http:") && hostname !== "tauri.localhost") return origin;
  }
  const site = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (!site) return null;
  try {
    const url = new URL(site);
    return url.protocol === "https:" || url.protocol === "http:" ? url.origin : null;
  } catch {
    return null;
  }
}

/** What to hand a recipient: a link when there is a shareable origin, else the code. */
export function inviteShareText(token: string): { text: string; isLink: boolean } {
  const origin = shareableOrigin();
  return origin ? { text: `${origin}${routes.joinInvite(token)}`, isLink: true } : { text: token, isLink: false };
}
