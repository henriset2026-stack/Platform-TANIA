/**
 * Tool argument validation.
 *
 * Model output is untrusted input. A handler must never parse it, so
 * arguments are validated here against the tool's declared schema and
 * rejected wholesale if they do not conform.
 *
 * `additionalProperties` is always treated as false: an unknown key is an
 * error, not something to ignore. Silently dropping an unexpected argument
 * would let a model's misunderstanding execute as a different operation than
 * it intended.
 */

import type { JsonSchema, JsonSchemaProperty } from "@/agents/core/types";

export type ValidationResult =
  | { readonly valid: true; readonly value: Record<string, unknown> }
  | { readonly valid: false; readonly errors: readonly string[] };

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function validateArguments(
  schema: JsonSchema,
  raw: unknown,
): ValidationResult {
  const errors: string[] = [];

  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { valid: false, errors: ["Arguments must be an object"] };
  }

  const input = raw as Record<string, unknown>;
  const allowed = new Set(Object.keys(schema.properties));

  for (const key of Object.keys(input)) {
    if (!allowed.has(key)) {
      errors.push(`Unknown argument: ${key}`);
    }
  }

  for (const required of schema.required ?? []) {
    if (!(required in input) || input[required] === undefined) {
      errors.push(`Missing required argument: ${required}`);
    }
  }

  const value: Record<string, unknown> = {};

  for (const [key, property] of Object.entries(schema.properties)) {
    if (!(key in input) || input[key] === undefined) continue;
    const problem = checkProperty(key, property, input[key]);
    if (problem) errors.push(problem);
    else value[key] = input[key];
  }

  return errors.length > 0 ? { valid: false, errors } : { valid: true, value };
}

function checkProperty(
  key: string,
  property: JsonSchemaProperty,
  raw: unknown,
): string | null {
  switch (property.type) {
    case "string": {
      if (typeof raw !== "string") return `${key} must be a string`;
      if (property.maxLength && raw.length > property.maxLength) {
        return `${key} exceeds ${property.maxLength} characters`;
      }
      if (property.enum && !property.enum.includes(raw)) {
        return `${key} must be one of: ${property.enum.join(", ")}`;
      }
      if (property.format === "uuid" && !UUID_RE.test(raw)) {
        return `${key} must be a UUID`;
      }
      if (property.format === "date" && !DATE_RE.test(raw)) {
        return `${key} must be an ISO date (YYYY-MM-DD)`;
      }
      return null;
    }
    case "number":
    case "integer": {
      if (typeof raw !== "number" || !Number.isFinite(raw)) {
        return `${key} must be a finite number`;
      }
      if (property.type === "integer" && !Number.isInteger(raw)) {
        return `${key} must be an integer`;
      }
      if (property.minimum !== undefined && raw < property.minimum) {
        return `${key} must be at least ${property.minimum}`;
      }
      if (property.maximum !== undefined && raw > property.maximum) {
        return `${key} must be at most ${property.maximum}`;
      }
      return null;
    }
    case "boolean":
      return typeof raw === "boolean" ? null : `${key} must be a boolean`;
  }
}
