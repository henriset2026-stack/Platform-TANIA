import { describe, expect, it } from "vitest";

import {
  PAGE_SIZE_DEFAULT,
  PAGE_SIZE_MAX,
  pageCount,
  pageRange,
  parseTalentQuery,
  sanitizeSearch,
  toSearchParams,
} from "@/lib/talent/filters";

/**
 * Directory query parsing.
 *
 * These parameters come from the URL, so the cases below are adversarial:
 * anything that is not explicitly valid must be rejected rather than passed
 * through to the database.
 */

describe("search sanitisation", () => {
  it("strips PostgREST wildcards so a search cannot widen its own match", () => {
    expect(sanitizeSearch("%")).toBe("");
    expect(sanitizeSearch("bu_di")).toBe("bu di");
    expect(sanitizeSearch("100%")).toBe("100");
  });

  it("strips commas and parentheses that would split the filter expression", () => {
    expect(sanitizeSearch("a,b")).toBe("a b");
    expect(sanitizeSearch("or(x.eq.1)")).toBe("or x.eq.1");
  });

  it("bounds length", () => {
    expect(sanitizeSearch("x".repeat(500))).toHaveLength(100);
  });

  it("handles absent input", () => {
    expect(sanitizeSearch(undefined)).toBe("");
    expect(sanitizeSearch("   ")).toBe("");
  });
});

describe("parseTalentQuery", () => {
  it("defaults everything when nothing is supplied", () => {
    const q = parseTalentQuery({});
    expect(q).toEqual({
      search: "",
      status: "all",
      squadId: "all",
      chapterId: "all",
      sort: "name",
      page: 1,
      pageSize: PAGE_SIZE_DEFAULT,
    });
  });

  it("rejects an unknown status rather than passing it through", () => {
    expect(parseTalentQuery({ status: "; drop table profiles" }).status).toBe("all");
    expect(parseTalentQuery({ status: "active" }).status).toBe("active");
  });

  it("rejects an unknown sort", () => {
    expect(parseTalentQuery({ sort: "salary" }).sort).toBe("name");
    expect(parseTalentQuery({ sort: "recent" }).sort).toBe("recent");
  });

  // A non-UUID squad filter must not reach the query.
  it("accepts only a UUID for scope filters", () => {
    const valid = "123e4567-e89b-12d3-a456-426614174000";
    expect(parseTalentQuery({ squad: valid }).squadId).toBe(valid);
    expect(parseTalentQuery({ squad: "all-squads" }).squadId).toBe("all");
    expect(parseTalentQuery({ chapter: "' or 1=1--" }).chapterId).toBe("all");
  });

  // An unbounded page size is a denial of service against per-row RLS.
  it("clamps page size to a maximum", () => {
    expect(parseTalentQuery({ pageSize: "100000" }).pageSize).toBe(PAGE_SIZE_MAX);
    expect(parseTalentQuery({ pageSize: "0" }).pageSize).toBe(1);
    expect(parseTalentQuery({ pageSize: "-5" }).pageSize).toBe(1);
    expect(parseTalentQuery({ pageSize: "abc" }).pageSize).toBe(PAGE_SIZE_DEFAULT);
  });

  it("clamps page number", () => {
    expect(parseTalentQuery({ page: "0" }).page).toBe(1);
    expect(parseTalentQuery({ page: "-1" }).page).toBe(1);
    expect(parseTalentQuery({ page: "99999999" }).page).toBe(10_000);
  });

  it("takes the first value when a parameter is repeated", () => {
    expect(parseTalentQuery({ status: ["active", "exited"] }).status).toBe("active");
  });
});

describe("pagination maths", () => {
  it("produces an inclusive range", () => {
    expect(pageRange(parseTalentQuery({ page: "1", pageSize: "25" }))).toEqual({
      from: 0,
      to: 24,
    });
    expect(pageRange(parseTalentQuery({ page: "3", pageSize: "10" }))).toEqual({
      from: 20,
      to: 29,
    });
  });

  it("counts pages", () => {
    expect(pageCount(0, 25)).toBe(0);
    expect(pageCount(1, 25)).toBe(1);
    expect(pageCount(25, 25)).toBe(1);
    expect(pageCount(26, 25)).toBe(2);
  });
});

describe("toSearchParams", () => {
  it("omits defaults", () => {
    expect(toSearchParams({ status: "all", page: 1, sort: "name" })).toBe("");
  });

  it("round-trips a non-default query", () => {
    const original = parseTalentQuery({
      q: "budi",
      status: "active",
      sort: "recent",
      page: "2",
    });
    const round = parseTalentQuery(
      Object.fromEntries(new URLSearchParams(toSearchParams(original).slice(1))),
    );
    expect(round).toEqual(original);
  });
});
