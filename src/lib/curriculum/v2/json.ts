import { createHash } from "node:crypto";
import { LIMITS } from "./common";
export type Diagnostic = { code: string; path: string; message: string };
export class ContentValidationError extends Error {
  constructor(public readonly diagnostics: Diagnostic[]) {
    super(diagnostics.map((d) => `${d.path} [${d.code}] ${d.message}`).join("\n"));
    this.name = "ContentValidationError";
  }
}
export function fail(code: string, path: string, message: string): never {
  throw new ContentValidationError([{ code, path, message }]);
}
export function sha256(bytes: string | Uint8Array) {
  return createHash("sha256").update(bytes).digest("hex");
}
// Stable keys, original array order and Unicode; no normalization or timestamps inserted.
export function canonicalJson(value: unknown): string {
  const ordered = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(ordered);
    if (v !== null && typeof v === "object")
      return Object.fromEntries(
        Object.entries(v)
          .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
          .map(([k, item]) => [k, ordered(item)]),
      );
    return v;
  };
  return `${JSON.stringify(ordered(value), null, 2)}\n`;
}
export function fingerprint(value: unknown) {
  return sha256(canonicalJson(value));
}
export function pointer(parts: (string | number)[]) {
  return `/${parts.map((s) => String(s).replaceAll("~", "~0").replaceAll("/", "~1")).join("/")}`;
}
export function atPointer(value: unknown, path: string): unknown {
  if (!path) return value;
  return path
    .slice(1)
    .split("/")
    .reduce<unknown>(
      (v, key) =>
        v !== null && typeof v === "object"
          ? (v as Record<string, unknown>)[key.replaceAll("~1", "/").replaceAll("~0", "~")]
          : undefined,
      value,
    );
}
// JSON.parse alone silently accepts duplicate keys. Scan structure before allocating the tree.
export function parseJson(bytes: Uint8Array | string, file: string): unknown {
  if (Buffer.byteLength(bytes) > LIMITS.jsonFileBytes)
    fail("json-size", file, "JSON exceeds the 16 MiB file limit");
  let s: string;
  try {
    s = typeof bytes === "string" ? bytes : new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    fail("invalid-utf8", file, "Expected valid UTF-8 JSON bytes");
  }
  let i = 0;
  const whitespace = () => {
    while (/[\t\n\r ]/.test(s[i] ?? "!") && i < s.length) i++;
  };
  const token = () => {
    const start = i++;
    while (i < s.length) {
      if (s[i] === "\\") {
        i += 2;
        continue;
      }
      if (s[i++] === '"') return JSON.parse(s.slice(start, i)) as string;
    }
    throw new Error("Unterminated string");
  };
  const value = (depth: number, path: string) => {
    if (depth > LIMITS.depth)
      fail("json-depth", `${file}${path}`, `JSON nesting exceeds ${LIMITS.depth}`);
    whitespace();
    const start = s[i];
    if (start === '"') {
      token();
      return;
    }
    if (start === "{" || start === "[") {
      const object = start === "{";
      const end = object ? "}" : "]";
      const keys = new Set<string>();
      i++;
      whitespace();
      if (s[i] === end) {
        i++;
        return;
      }
      let n = 0;
      while (i < s.length) {
        whitespace();
        let key = String(n++);
        if (object) {
          if (s[i] !== '"') throw new Error("Expected object key");
          key = token();
          if (keys.has(key))
            fail(
              "duplicate-json-key",
              `${file}${path}/${key}`,
              `Duplicate key ${JSON.stringify(key)}`,
            );
          keys.add(key);
          whitespace();
          if (s[i++] !== ":") throw new Error("Expected colon");
        }
        value(depth + 1, `${path}/${key}`);
        whitespace();
        if (s[i] === end) {
          i++;
          return;
        }
        if (s[i++] !== ",") throw new Error("Expected comma");
      }
      throw new Error("Unterminated container");
    }
    const scalar = /^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/.exec(
      s.slice(i),
    );
    if (!scalar) throw new Error(`Invalid JSON at byte ${i}`);
    i += scalar[0].length;
  };
  try {
    value(0, "");
    whitespace();
    if (i !== s.length) throw new Error("Trailing JSON content");
    return JSON.parse(s);
  } catch (error) {
    if (error instanceof ContentValidationError) throw error;
    fail("invalid-json", file, error instanceof Error ? error.message : "Invalid JSON");
  }
}
