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
  // Fully deterministic: pin `now` to a fixed instant and derive every due
  // date from the SAME local-midnight the implementation computes. Because
  // dueStatus now derives its day window from `now` (not the wall clock),
  // these results are independent of the runner's clock and timezone.
  const DAY = 24 * 3600_000;
  const now = Date.parse("2026-05-30T12:00:00.000Z");
  // Local midnight of `now`, matching dueStatus's own `new Date(now).setHours(0,..)`.
  const midnight = (() => {
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  })();

  it("returns 'none' when no date provided", () => {
    assert.equal(dueStatus(undefined, now), "none");
  });

  it("returns 'overdue' for a date before today's start", () => {
    const past = new Date(midnight - 5 * DAY).toISOString();
    assert.equal(dueStatus(past, now), "overdue");
  });

  it("returns 'today' for a date inside today's local window", () => {
    const middayToday = new Date(midnight + 8 * 3600_000).toISOString();
    assert.equal(dueStatus(middayToday, now), "today");
  });

  it("returns 'soon' for a date within the next 7 days", () => {
    const inThree = new Date(midnight + 3 * DAY).toISOString();
    assert.equal(dueStatus(inThree, now), "soon");
  });

  it("returns 'later' for a date >7 days out", () => {
    const inMonth = new Date(midnight + 30 * DAY).toISOString();
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

  it("dueStatus: the exact start-of-today boundary is 'today'", () => {
    // Pin now; derive the local-midnight the impl uses, then probe the
    // inclusive lower edge of the today window.
    const now = Date.parse("2026-05-30T12:00:00.000Z");
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    assert.equal(dueStatus(new Date(start.getTime()).toISOString(), now), "today");
  });

  it("dueStatus: the last millisecond of today is still 'today'", () => {
    const now = Date.parse("2026-05-30T12:00:00.000Z");
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    // todayEnd is exclusive, so the last in-window instant is end-1ms.
    const lastMs = start.getTime() + 24 * 3600_000 - 1;
    assert.equal(dueStatus(new Date(lastMs).toISOString(), now), "today");
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

  it("localDateInputToIso: day=0 in YYYY-MM-DD returns undefined", () => {
    assert.equal(localDateInputToIso("2026-05-00"), undefined);
  });

  it("localDateInputToIso: month=0 in YYYY-MM-DD returns undefined", () => {
    assert.equal(localDateInputToIso("2026-00-15"), undefined);
  });

  it("isoToLocalDateInput: Dec 31 round-trips correctly", () => {
    const iso = new Date(2026, 11, 31).toISOString();
    assert.equal(isoToLocalDateInput(iso), "2026-12-31");
  });
});
