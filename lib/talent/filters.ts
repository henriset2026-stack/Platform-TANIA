/**
 * Talent directory query parameters.
 *
 * Pure parsing and validation, separated from the query so it is testable and
 * so every value is bounded before it reaches the database.
 *
 * Untrusted input: these come from the URL. Nothing here is interpolated into
 * SQL — the query layer uses parameterised PostgREST filters — but page size
 * and offset are still clamped, because an unbounded `limit` is a denial of
 * service against a table RLS must evaluate row by row.
 */

export const TALENT_SORTS = ["name", "recent"] as const;
export type TalentSort = (typeof TALENT_SORTS)[number];

export const TALENT_STATUSES = ["active", "inactive", "on_leave", "exited"] as const;
export type TalentStatus = (typeof TALENT_STATUSES)[number];

export const PAGE_SIZE_DEFAULT = 25;
export const PAGE_SIZE_MAX = 100;

export interface TalentQuery {
  readonly search: string;
  readonly status: TalentStatus | "all";
  readonly squadId: string | "all";
  readonly chapterId: string | "all";
  readonly sort: TalentSort;
  readonly page: number;
  readonly pageSize: number;
}

export type RawSearchParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function clampInt(value: string | undefined, min: number, max: number, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
}

/** UUID, or "all". Anything else is rejected rather than passed through. */
function uuidOrAll(value: string | undefined): string | "all" {
  if (!value || value === "all") return "all";
  const isUuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
  return isUuid ? value : "all";
}

/**
 * Normalises a free-text search term.
 *
 * PostgREST `ilike` treats % and _ as wildcards, and a comma would split the
 * filter expression. All three are stripped so a search box cannot alter the
 * shape of the query it feeds.
 */
export function sanitizeSearch(value: string | undefined): string {
  if (!value) return "";
  return value.replace(/[%_,()]/g, " ").trim().slice(0, 100);
}

export function parseTalentQuery(params: RawSearchParams): TalentQuery {
  const statusRaw = first(params["status"]);
  const status = TALENT_STATUSES.includes(statusRaw as TalentStatus)
    ? (statusRaw as TalentStatus)
    : "all";

  const sortRaw = first(params["sort"]);
  const sort = TALENT_SORTS.includes(sortRaw as TalentSort)
    ? (sortRaw as TalentSort)
    : "name";

  return {
    search: sanitizeSearch(first(params["q"])),
    status,
    squadId: uuidOrAll(first(params["squad"])),
    chapterId: uuidOrAll(first(params["chapter"])),
    sort,
    page: clampInt(first(params["page"]), 1, 10_000, 1),
    pageSize: clampInt(
      first(params["pageSize"]),
      1,
      PAGE_SIZE_MAX,
      PAGE_SIZE_DEFAULT,
    ),
  };
}

/** Inclusive PostgREST range for the requested page. */
export function pageRange(query: TalentQuery): { from: number; to: number } {
  const from = (query.page - 1) * query.pageSize;
  return { from, to: from + query.pageSize - 1 };
}

/** Serialises back to a query string, omitting defaults to keep URLs clean. */
export function toSearchParams(query: Partial<TalentQuery>): string {
  const params = new URLSearchParams();
  if (query.search) params.set("q", query.search);
  if (query.status && query.status !== "all") params.set("status", query.status);
  if (query.squadId && query.squadId !== "all") params.set("squad", query.squadId);
  if (query.chapterId && query.chapterId !== "all") {
    params.set("chapter", query.chapterId);
  }
  if (query.sort && query.sort !== "name") params.set("sort", query.sort);
  if (query.page && query.page > 1) params.set("page", String(query.page));
  if (query.pageSize && query.pageSize !== PAGE_SIZE_DEFAULT) {
    params.set("pageSize", String(query.pageSize));
  }
  const s = params.toString();
  return s ? `?${s}` : "";
}

export interface Page<T> {
  readonly rows: readonly T[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
  readonly pageCount: number;
}

export function pageCount(total: number, pageSize: number): number {
  return total === 0 ? 0 : Math.ceil(total / pageSize);
}
