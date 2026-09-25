/**
 * Tool argument and result validation.
 *
 * Model output is untrusted input. A handler must never parse it, so
 * arguments are validated here against the tool's declared schema and
 * rejected wholesale if they do not conform.
 *
 * Tool RESULTS are validated too (validateOutput): a result is about to be
 * shown to a model and to a person, so a handler that returns fields nobody
 * declared — an extra column, a whole row — is a failure, not a bonus. This
 * is what keeps a query change from silently widening what reaches the model.
 *
 * `additionalProperties` is always treated as false, at every depth: an
 * unknown key is an error, not something to ignore.
 */

import type { JsonSchema, JsonSchemaProperty } from "@/agents/core/types";

export type ValidationResult =
  | { readonly valid: true; readonly value: Record<string, unknown> }
  | { readonly valid: false; readonly errors: readonly string[] };

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Errors reported per validation; a malformed array should not flood the log. */
const MAX_ERRORS = 10;

export function validateArguments(schema: JsonSchema, raw: unknown): ValidationResult {
  return validateObject(schema, raw, { noun: "argument", root: "Arguments" });
}

export function validateOutput(schema: JsonSchema, raw: unknown): ValidationResult {
  return validateObject(schema, raw, { noun: "field", root: "Result" });
}

function validateObject(
  schema: JsonSchema,
  raw: unknown,
  words: { noun: string; root: string },
): ValidationResult {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { valid: false, errors: [`${words.root} must be an object`] };
  }

  const errors: string[] = [];
  const input = raw as Record<string, unknown>;

  for (const key of Object.keys(input)) {
    if (!(key in schema.properties)) errors.push(`Unknown ${words.noun}: ${key}`);
  }
  for (const required of schema.required ?? []) {
    if (!(required in input) || input[required] === undefined) {
      errors.push(`Missing required ${words.noun}: ${required}`);
    }
  }

  const value: Record<string, unknown> = {};
  for (const [key, property] of Object.entries(schema.properties)) {
    if (!(key in input) || input[key] === undefined) continue;
    const problems = checkValue(key, property, input[key]);
    if (problems.length > 0) errors.push(...problems);
    else value[key] = input[key];
  }

  return errors.length > 0
    ? { valid: false, errors: errors.slice(0, MAX_ERRORS) }
    : { valid: true, value };
}

function checkValue(path: string, property: JsonSchemaProperty, raw: unknown): string[] {
  if (raw === null) {
    return property.nullable ? [] : [`${path} must not be null`];
  }

  switch (property.type) {
    case "string": {
      if (typeof raw !== "string") return [`${path} must be a string`];
      if (property.maxLength && raw.length > property.maxLength) {
        return [`${path} exceeds ${property.maxLength} characters`];
      }
      if (property.enum && !property.enum.includes(raw)) {
        return [`${path} must be one of: ${property.enum.join(", ")}`];
      }
      if (property.format === "uuid" && !UUID_RE.test(raw)) return [`${path} must be a UUID`];
      if (property.format === "date" && !DATE_RE.test(raw)) {
        return [`${path} must be an ISO date (YYYY-MM-DD)`];
      }
      if (property.format === "date-time" && Number.isNaN(Date.parse(raw))) {
        return [`${path} must be an ISO date-time`];
      }
      return [];
    }
    case "number":
    case "integer": {
      if (typeof raw !== "number" || !Number.isFinite(raw)) return [`${path} must be a finite number`];
      if (property.type === "integer" && !Number.isInteger(raw)) return [`${path} must be an integer`];
      if (property.minimum !== undefined && raw < property.minimum) {
        return [`${path} must be at least ${property.minimum}`];
      }
      if (property.maximum !== undefined && raw > property.maximum) {
        return [`${path} must be at most ${property.maximum}`];
      }
      return [];
    }
    case "boolean":
      return typeof raw === "boolean" ? [] : [`${path} must be a boolean`];
    case "array": {
      if (!Array.isArray(raw)) return [`${path} must be an array`];
      if (property.maxItems !== undefined && raw.length > property.maxItems) {
        return [`${path} has more than ${property.maxItems} items`];
      }
      if (!property.items) return [`${path} declares no item type`];
      const problems: string[] = [];
      for (let i = 0; i < raw.length && problems.length < MAX_ERRORS; i += 1) {
        problems.push(...checkValue(`${path}[${i}]`, property.items, raw[i]));
      }
      return problems;
    }
    case "object": {
      if (typeof raw !== "object" || Array.isArray(raw)) return [`${path} must be an object`];
      const fields = property.properties ?? {};
      const record = raw as Record<string, unknown>;
      const problems: string[] = [];
      for (const key of Object.keys(record)) {
        if (!(key in fields)) problems.push(`Unknown field: ${path}.${key}`);
      }
      for (const required of property.required ?? []) {
        if (!(required in record) || record[required] === undefined) {
          problems.push(`Missing required field: ${path}.${required}`);
        }
      }
      for (const [key, child] of Object.entries(fields)) {
        if (!(key in record) || record[key] === undefined) continue;
        problems.push(...checkValue(`${path}.${key}`, child, record[key]));
      }
      return problems;
    }
  }
}
