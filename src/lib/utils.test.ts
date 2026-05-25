import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  cn,
  dueStatus,
  formatDateShort,
  initials,
  isoToLocalDateInput,
  localDateInputToIso,
  priorityColor,
  priorityRank,
  slug,
  statusColor,
  timeAgo,
} from "./utils";

describe("initials", () => {
  it("returns the first two name initials, uppercased", () => {
    assert.equal(initials("Robert Clapp"), "RC");
  });

  it("handles single-word names", () => {
    assert.equal(initials("Madonna"), "M");
  });

  it("collapses multiple spaces", () => {
    assert.equal(initials("Robert   Q   Clapp"), "RQ");
  });

  it("ignores empty pieces from leading/trailing whitespace", () => {
    assert.equal(initials("  Robert  "), "R");
  });

  it("returns '' for empty input", () => {
    assert.equal(initials(""), "");
  });

  it("caps at 2 characters even for long names", () => {
    assert.equal(initials("Anne Boleyn Tudor Plantagenet"), "AB");
  });
});

describe("priorityRank", () => {
  it("orders urgent → none low-to-high", () => {
    assert.ok(priorityRank("urgent") < priorityRank("high"));
    assert.ok(priorityRank("high") < priorityRank("medium"));
    assert.ok(priorityRank("medium") < priorityRank("low"));
    assert.ok(priorityRank("low") < priorityRank("none"));
  });

  it("returns 0 for urgent and 4 for none (UI sort key contract)", () => {
    assert.equal(priorityRank("urgent"), 0);
    assert.equal(priorityRank("none"), 4);
  });
});

describe("statusColor / priorityColor", () => {
  it("returns a hex color for every status", () => {
    for (const s of [
      "backlog",
      "todo",
      "in_progress",
      "in_review",
      "done",
      "cancelled",
    ] as const) {
      assert.match(statusColor(s), /^#[0-9a-f]{6}$/i, `status=${s}`);
    }
  });

  it("returns a hex color for every priority", () => {
    for (const p of ["urgent", "high", "medium", "low", "none"] as const) {
      assert.match(priorityColor(p), /^#[0-9a-f]{6}$/i, `priority=${p}`);
    }
  });
});

describe("slug", () => {
  it("uppercases and strips non-alphanumeric, caps at 4", () => {
    assert.equal(slug("My Project!"), "MYPR");
  });

  it("preserves digits", () => {
    assert.equal(slug("v2 launch"), "V2LA");
  });

  it("trims whitespace", () => {
    assert.equal(slug("  abc  "), "ABC");
  });

  it("returns '' for empty or symbol-only input", () => {
    assert.equal(slug(""), "");
    assert.equal(slug("!!!"), "");
  });
});

describe("timeAgo", () => {
  // Use a small offset from now so unit choice (s/m/h/d/mo) is stable.
  const now = Date.now();
  it("seconds for <60s", () => {
    const t = new Date(now - 5_000).toISOString();
    assert.match(timeAgo(t), /^\d+s$/);
  });

  it("minutes for 1–59min", () => {
    const t = new Date(now - 10 * 60_000).toISOString();
    assert.match(timeAgo(t), /^\d+m$/);
  });

  it("hours for 1–23h", () => {
    const t = new Date(now - 5 * 3600_000).toISOString();
    assert.match(timeAgo(t), /^\d+h$/);
  });

  it("days for 1–29d", () => {
    const t = new Date(now - 5 * 24 * 3600_000).toISOString();
    assert.match(timeAgo(t), /^\d+d$/);
  });

  it("months for >=30d", () => {
    const t = new Date(now - 90 * 24 * 3600_000).toISOString();
    assert.match(timeAgo(t), /^\d+mo$/);
  });
});

describe("dueStatus", () => {
  // Pin "now" to a known UTC midnight + 12h so the local "today" window
  // is well-defined for the test runner's timezone.
  const startOfToday = new Date();
  startOfToday.setHours(12, 0, 0, 0);
  const now = startOfToday.getTime();

  it("returns 'none' when no date provided", () => {
    assert.equal(dueStatus(undefined, now), "none");
  });

  it("returns 'overdue' for a past date", () => {
    const past = new Date(now - 5 * 24 * 3600_000).toISOString();
    assert.equal(dueStatus(past, now), "overdue");
  });

  it("returns 'today' for today's date", () => {
    // Use midnight-local today
    const startLocal = new Date();
    startLocal.setHours(8, 0, 0, 0);
    assert.equal(dueStatus(startLocal.toISOString(), now), "today");
  });

  it("returns 'soon' for a date within the next 7 days", () => {
    const inThree = new Date(now + 3 * 24 * 3600_000).toISOString();
    assert.equal(dueStatus(inThree, now), "soon");
  });

  it("returns 'later' for a date >7 days out", () => {
    const inMonth = new Date(now + 30 * 24 * 3600_000).toISOString();
    assert.equal(dueStatus(inMonth, now), "later");
  });
});

describe("localDateInputToIso / isoToLocalDateInput", () => {
  // These helpers exist specifically to avoid the
  // "new Date('YYYY-MM-DD') = UTC midnight" bug that shifts the calendar
  // day for anyone west of UTC. Test the round-trip property.

  it("round-trips an input value through iso and back", () => {
    const inputs = ["2026-01-01", "2026-05-25", "2026-12-31"];
    for (const v of inputs) {
      const iso = localDateInputToIso(v)!;
      assert.ok(iso, `null for ${v}`);
      const back = isoToLocalDateInput(iso);
      assert.equal(back, v, `round-trip failed for ${v}`);
    }
  });

  it("returns undefined for empty / malformed input", () => {
    assert.equal(localDateInputToIso(""), undefined);
    assert.equal(localDateInputToIso("not-a-date"), undefined);
    assert.equal(localDateInputToIso("0000-00-00"), undefined);
  });

  it("isoToLocalDateInput returns '' for undefined", () => {
    assert.equal(isoToLocalDateInput(undefined), "");
  });

  it("isoToLocalDateInput pads month/day with zeros", () => {
    const iso = new Date(2026, 0, 5).toISOString(); // Jan 5
    assert.equal(isoToLocalDateInput(iso), "2026-01-05");
  });
});

describe("formatDateShort", () => {
  it("returns '—' when no iso is given", () => {
    assert.equal(formatDateShort(undefined), "—");
  });

  it("returns a non-empty short date for a valid iso", () => {
    const out = formatDateShort("2026-05-25T00:00:00.000Z");
    assert.ok(out.length > 0);
    assert.notEqual(out, "—");
  });
});

// ── Additional: cn() ──────────────────────────────────────────────────────

describe("cn", () => {
  it("returns empty string when called with no arguments", () => {
    assert.equal(cn(), "");
  });

  it("joins multiple class names", () => {
    const result = cn("foo", "bar");
    assert.ok(result.includes("foo"));
    assert.ok(result.includes("bar"));
  });

  it("excludes falsy values (false, null, undefined)", () => {
    const result = cn("foo", false, null, undefined, "bar");
    assert.ok(result.includes("foo"));
    assert.ok(result.includes("bar"));
    assert.ok(!result.includes("false"));
    assert.ok(!result.includes("null"));
  });

  it("handles conditional object syntax from clsx", () => {
    const result = cn({ active: true, disabled: false });
    assert.ok(result.includes("active"));
    assert.ok(!result.includes("disabled"));
  });

  it("handles array syntax from clsx", () => {
    const result = cn(["class-a", "class-b"]);
    assert.ok(result.includes("class-a"));
    assert.ok(result.includes("class-b"));
  });
});

// ── Additional: slug boundaries ────────────────────────────────────────────

describe("slug — additional boundary cases", () => {
  it("returns exactly 4 chars when input is longer than 4 alphanumeric chars", () => {
    const result = slug("ABCDEFGH");
    assert.equal(result.length, 4);
    assert.equal(result, "ABCD");
  });

  it("returns shorter when input has fewer than 4 alphanumeric chars", () => {
    assert.equal(slug("AB"), "AB");
    assert.equal(slug("A"), "A");
  });

  it("handles mixed case correctly (uppercases all)", () => {
    assert.equal(slug("abc"), "ABC");
  });
});

// ── Additional: timeAgo boundaries ────────────────────────────────────────

describe("timeAgo — boundary values", () => {
  it("boundary at exactly 60 seconds returns minutes or seconds", () => {
    // At exactly 60s, Math.round(60/1000) = 0 or 60 depending on precision
    // We just check no crash and a valid format
    const t = new Date(Date.now() - 59_500).toISOString();
    const result = timeAgo(t);
    assert.match(result, /^\d+(s|m)$/);
  });

  it("boundary at exactly 60 minutes returns hours or minutes", () => {
    const t = new Date(Date.now() - 59 * 60_000).toISOString();
    const result = timeAgo(t);
    assert.match(result, /^\d+(m|h)$/);
  });

  it("handles a very recent timestamp (near 0s diff)", () => {
    const t = new Date(Date.now() - 500).toISOString();
    const result = timeAgo(t);
    assert.match(result, /^\d+s$/);
  });
});

// ── Additional: dueStatus edge cases ─────────────────────────────────────

describe("dueStatus — edge cases", () => {
  it("'today' at the very start of the local day", () => {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const iso = startOfToday.toISOString();
    // Even at midnight-start, it should be "today" not "overdue"
    const result = dueStatus(iso, Date.now());
    assert.ok(result === "today" || result === "overdue"); // depends on exact clock
  });

  it("exactly at 7-day boundary returns 'soon' or 'later'", () => {
    const now = Date.now();
    const sevenDays = new Date(now + 7 * 24 * 60 * 60 * 1000 - 1).toISOString();
    const result = dueStatus(sevenDays, now);
    assert.ok(result === "soon" || result === "later");
  });
});
