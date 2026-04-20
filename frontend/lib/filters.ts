// Generic filter engine that can slice any array-of-records dataset based on a
// structured FilterSpec. The AI populates the spec from the user's natural
// language prompt; this module deterministically applies it.

export type FilterOp =
  | "="
  | "!="
  | ">"
  | "<"
  | ">="
  | "<="
  | "contains"
  | "not_contains"
  | "starts_with"
  | "ends_with"
  | "regex"
  | "in"
  | "not_in"
  | "is_null"
  | "is_not_null"
  | "truthy"
  | "falsy";

export interface FilterClause {
  field: string;
  op: FilterOp;
  value?: unknown;
}

export interface FilterSpec {
  // All clauses are AND-ed together. OR groups can be expressed as nested arrays.
  filters?: FilterClause[];
  sort?: { field: string; direction?: "asc" | "desc" };
  limit?: number;
  // Project only these fields in the output. Useful when the user says "just
  // show me source URL and anchor".
  fields?: string[];
}

function getField(row: unknown, field: string): unknown {
  if (row === null || typeof row !== "object") return undefined;
  // Support dot-paths like "positions.example.com".
  const parts = field.split(".");
  let current: unknown = row;
  for (const p of parts) {
    if (current === null || current === undefined) return undefined;
    current = (current as Record<string, unknown>)[p];
  }
  return current;
}

function evalClause(row: unknown, clause: FilterClause): boolean {
  const v = getField(row, clause.field);
  const target = clause.value;

  switch (clause.op) {
    case "=":
      return v === target || String(v) === String(target);
    case "!=":
      return v !== target && String(v) !== String(target);
    case ">":
      return typeof v === "number" && typeof target === "number" && v > target;
    case "<":
      return typeof v === "number" && typeof target === "number" && v < target;
    case ">=":
      return typeof v === "number" && typeof target === "number" && v >= target;
    case "<=":
      return typeof v === "number" && typeof target === "number" && v <= target;
    case "contains":
      return String(v ?? "").toLowerCase().includes(String(target ?? "").toLowerCase());
    case "not_contains":
      return !String(v ?? "").toLowerCase().includes(String(target ?? "").toLowerCase());
    case "starts_with":
      return String(v ?? "")
        .toLowerCase()
        .startsWith(String(target ?? "").toLowerCase());
    case "ends_with":
      return String(v ?? "")
        .toLowerCase()
        .endsWith(String(target ?? "").toLowerCase());
    case "regex":
      try {
        return new RegExp(String(target), "i").test(String(v ?? ""));
      } catch {
        return false;
      }
    case "in":
      return Array.isArray(target) && target.some((t) => String(t) === String(v));
    case "not_in":
      return Array.isArray(target) && !target.some((t) => String(t) === String(v));
    case "is_null":
      return v === null || v === undefined || v === "";
    case "is_not_null":
      return v !== null && v !== undefined && v !== "";
    case "truthy":
      return Boolean(v);
    case "falsy":
      return !v;
    default:
      return true;
  }
}

/**
 * Apply a FilterSpec to a list of rows. Returns a new array; never mutates
 * the input. Unknown fields are treated as undefined (clause evaluates to
 * false for comparisons, true for is_null). Never throws.
 */
export function applyFilter<T>(rows: T[], spec?: FilterSpec | null): T[] {
  if (!spec || !rows) return rows;
  let filtered: unknown[] = rows as unknown[];

  if (spec.filters && spec.filters.length > 0) {
    filtered = filtered.filter((row) => spec.filters!.every((c) => evalClause(row, c)));
  }

  if (spec.sort?.field) {
    const field = spec.sort.field;
    const dir = spec.sort.direction === "asc" ? 1 : -1;
    filtered = [...filtered].sort((a, b) => {
      const av = getField(a, field);
      const bv = getField(b, field);
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
      const as = String(av ?? "");
      const bs = String(bv ?? "");
      return as.localeCompare(bs) * dir;
    });
  }

  if (typeof spec.limit === "number" && spec.limit >= 0) {
    filtered = filtered.slice(0, spec.limit);
  }

  if (spec.fields && spec.fields.length > 0) {
    filtered = filtered.map((row) => {
      const out: Record<string, unknown> = {};
      for (const f of spec.fields!) out[f] = getField(row, f);
      return out;
    });
  }

  return filtered as T[];
}

/**
 * Shape of the filter-spec bundle the AI produces — one FilterSpec per intent.
 * Using a separate key per intent lets the user say things like
 * "backlinks dofollow only, keywords above 1000 search volume" and have each
 * slice applied to its matching dataset.
 */
export type IntentFilterSpecs = Record<string, FilterSpec>;
