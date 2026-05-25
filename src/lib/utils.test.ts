import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
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

describe("utils boundary cases", () => {
  it("timeAgo: exactly 0s emits '0s'", () => {
    const t = new Date(Date.now()).toISOString();
    assert.match(timeAgo(t), /^0s$/);
  });

  it("dueStatus: midnight start-of-today is classified 'today'", () => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    assert.equal(dueStatus(start.toISOString(), Date.now()), "today");
  });

  it("dueStatus: returns 'none' for empty string", () => {
    assert.equal(dueStatus("", Date.now()), "none");
  });

  it("slug: caps at 4 chars even with many valid alphanumerics", () => {
    assert.equal(slug("ABCDEFG").length, 4);
    assert.equal(slug("12345").length, 4);
  });

  it("initials: handles all-space input gracefully", () => {
    assert.equal(initials("     "), "");
  });
});
