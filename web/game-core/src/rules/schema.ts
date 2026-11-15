// A small JSON Schema validator for the contract schemas in contracts/schemas/ (embedded in contracts.generated.ts).
//
// It implements only the keywords the generator allows (SUPPORTED_KEYWORDS in scripts/gen-contracts.ts), and it
// checks them in one fixed order, so the Python mirror (Phase 12) can report the same problems in the same order:
//
//   $ref, type (a wrong type stops this node), const, enum, minLength, maxLength, pattern, minimum, maximum,
//   minItems, maxItems, items, required (in the schema's order), properties (in the schema's order),
//   then each key of the value sorted by code unit: propertyNames, then additionalProperties; allOf; if/then.
//
// A problem is {field, rule}: field is a path such as op.payload.placements[0].level and rule is the keyword that
// failed. Values are never copied into a problem (G section 1.2: details never carry values). Identical problems
// are reported once.
import { SCHEMAS, type ValidationProblem } from "./contracts.generated";

type Node = { readonly [key: string]: unknown };

function isNode(value: unknown): value is Node {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const patterns = new Map<string, RegExp>();
function regex(pattern: string): RegExp {
  let compiled = patterns.get(pattern);
  if (compiled === undefined) {
    compiled = new RegExp(pattern, "u");
    patterns.set(pattern, compiled);
  }
  return compiled;
}

/** JSON Schema counts characters as code points, not UTF-16 units (Python's len() does the same). */
function codePoints(text: string): number {
  return [...text].length; // a string's iterator walks code points
}

function typeMatches(type: string, value: unknown): boolean {
  switch (type) {
    case "object":
      return isNode(value);
    case "array":
      return Array.isArray(value);
    case "string":
      return typeof value === "string";
    case "integer":
      return typeof value === "number" && Number.isInteger(value);
    case "number":
      return typeof value === "number" && Number.isFinite(value);
    case "boolean":
      return typeof value === "boolean";
    case "null":
      return value === null;
    default:
      throw new Error(`schema uses unknown type ${type}`);
  }
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((v, i) => deepEqual(v, b[i]));
  if (isNode(a) && isNode(b)) {
    const keys = Object.keys(a);
    return keys.length === Object.keys(b).length && keys.every((k) => Object.hasOwn(b, k) && deepEqual(a[k], b[k]));
  }
  return false;
}

/** Resolve "file.schema.json#/$defs/x", "#/$defs/x" or "file.schema.json" against the current schema's $id. */
function resolveRef(ref: string, baseId: string): { schema: Node; baseId: string } {
  const hash = ref.indexOf("#");
  const file = hash === -1 ? ref : ref.slice(0, hash);
  const pointer = hash === -1 ? "" : ref.slice(hash + 1);
  const id = file === "" ? baseId : file;
  let target: unknown = SCHEMAS[id];
  for (const part of pointer.split("/").filter((p) => p !== "")) target = isNode(target) ? target[part] : undefined;
  if (!isNode(target)) throw new Error(`cannot resolve $ref ${ref} from ${baseId}`);
  return { schema: target, baseId: id };
}

function num(schema: Node, key: string): number | undefined {
  const value = schema[key];
  return typeof value === "number" ? value : undefined;
}

function check(schema: Node, baseId: string, value: unknown, path: string, out: ValidationProblem[]): void {
  const fail = (rule: string, field = path): void => {
    if (!out.some((p) => p.field === field && p.rule === rule)) out.push({ field, rule });
  };

  const ref = schema["$ref"];
  if (typeof ref === "string") {
    const target = resolveRef(ref, baseId);
    check(target.schema, target.baseId, value, path, out);
  }

  const type = schema["type"];
  if (type !== undefined) {
    const types = Array.isArray(type) ? type : [type];
    if (!types.some((t) => typeof t === "string" && typeMatches(t, value))) {
      fail("type");
      return;
    }
  }
  if (Object.hasOwn(schema, "const") && !deepEqual(value, schema["const"])) fail("const");
  const enumValues = schema["enum"];
  if (Array.isArray(enumValues) && !enumValues.some((e) => deepEqual(e, value))) fail("enum");

  if (typeof value === "string") {
    const minLength = num(schema, "minLength");
    const maxLength = num(schema, "maxLength");
    if (minLength !== undefined && codePoints(value) < minLength) fail("minLength");
    if (maxLength !== undefined && codePoints(value) > maxLength) fail("maxLength");
    const pattern = schema["pattern"];
    if (typeof pattern === "string" && !regex(pattern).test(value)) fail("pattern");
  }

  if (typeof value === "number") {
    const minimum = num(schema, "minimum");
    const maximum = num(schema, "maximum");
    if (minimum !== undefined && value < minimum) fail("minimum");
    if (maximum !== undefined && value > maximum) fail("maximum");
  }

  if (Array.isArray(value)) {
    const minItems = num(schema, "minItems");
    const maxItems = num(schema, "maxItems");
    if (minItems !== undefined && value.length < minItems) fail("minItems");
    if (maxItems !== undefined && value.length > maxItems) fail("maxItems");
    const items = schema["items"];
    if (isNode(items)) value.forEach((item, i) => check(items, baseId, item, `${path}[${i}]`, out));
  }

  if (isNode(value)) {
    const required = schema["required"];
    if (Array.isArray(required)) {
      for (const name of required) {
        if (typeof name === "string" && !Object.hasOwn(value, name)) fail("required", `${path}.${name}`);
      }
    }
    const properties = isNode(schema["properties"]) ? schema["properties"] : {};
    for (const [name, sub] of Object.entries(properties)) {
      if (isNode(sub) && Object.hasOwn(value, name)) check(sub, baseId, value[name], `${path}.${name}`, out);
    }
    const propertyNames = schema["propertyNames"];
    const additional = schema["additionalProperties"];
    for (const key of Object.keys(value).sort()) {
      const field = `${path}.${key}`;
      if (isNode(propertyNames)) {
        const nameProblems: ValidationProblem[] = [];
        check(propertyNames, baseId, key, field, nameProblems);
        if (nameProblems.length > 0) fail("propertyNames", field);
      }
      if (Object.hasOwn(properties, key)) continue;
      if (additional === false) fail("additionalProperties", field);
      else if (isNode(additional)) check(additional, baseId, value[key], field, out);
    }
  }

  const allOf = schema["allOf"];
  if (Array.isArray(allOf)) for (const sub of allOf) if (isNode(sub)) check(sub, baseId, value, path, out);

  const condition = schema["if"];
  const then = schema["then"];
  if (isNode(condition) && isNode(then)) {
    const silent: ValidationProblem[] = [];
    check(condition, baseId, value, path, silent);
    if (silent.length === 0) check(then, baseId, value, path, out);
  }
}

/**
 * Validate `value` against the contract schema with this $id (for example "op.schema.json").
 * Returns every problem found, in the fixed order described at the top of this file; an empty list means valid.
 */
export function validate(schemaId: string, value: unknown, root = "op"): ValidationProblem[] {
  const schema = SCHEMAS[schemaId];
  if (!isNode(schema)) throw new Error(`unknown schema ${schemaId}`);
  const out: ValidationProblem[] = [];
  check(schema, schemaId, value, root, out);
  return out;
}
