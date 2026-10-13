// @vitest-environment node
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import ts from "typescript";
import { expect, it } from "vitest";

// Follow actual imports, including future refactors, rather than just checking one entry file.
function dependencyGraph(entry: string, visited = new Set<string>()): Set<string> {
  const path = resolve(entry);
  if (visited.has(path)) return visited;
  visited.add(path);
  const source = ts.createSourceFile(path, readFileSync(path, "utf8"), ts.ScriptTarget.Latest);
  const specifiers: string[] = [];
  const walk = (node: ts.Node) => {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    )
      specifiers.push(node.moduleSpecifier.text);
    if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments[0] &&
      ts.isStringLiteral(node.arguments[0])
    )
      specifiers.push(node.arguments[0].text);
    ts.forEachChild(node, walk);
  };
  walk(source);
  for (const specifier of specifiers) {
    const base = specifier.startsWith("@/")
      ? resolve("src", specifier.slice(2))
      : specifier.startsWith(".")
        ? resolve(dirname(path), specifier)
        : null;
    if (!base) continue;
    const child = [base + ".ts", base + ".tsx", resolve(base, "index.ts")].find(existsSync);
    if (child) dependencyGraph(child, visited);
  }
  return visited;
}

it("guards catalog and history entry points from client imports and cannot reach persistence/writers", () => {
  const directory = "src/lib/curriculum/catalog";
  for (const file of ["server.ts", "report.ts", "public-entities.ts"])
    expect(readFileSync(resolve(directory, file), "utf8")).toMatch(/^import "server-only";/);
  const dependencies = dependencyGraph(resolve(directory, "server.ts"));
  for (const path of dependencies) {
    expect(path).not.toMatch(
      /\/supabase\/|\/app\/api\/|\/curriculum\/v2\/(?:files|authoring|editorial)\.ts$/,
    );
    expect(path).not.toMatch(/\/learning\/(?:server|outbox|canonical)\.ts$/);
    expect(readFileSync(path, "utf8")).not.toMatch(
      /from ["']node:fs[^"']*["'];[\s\S]*\b(?:writeFile|mkdir|unlink|rm)\(/,
    );
  }
});

it("keeps the existing public v1 loader and preview independent of D1", () => {
  for (const entry of [
    "src/lib/curriculum/index.ts",
    "src/lib/curriculum/preview/server.ts",
    "src/lib/learning/canonical.ts",
  ])
    expect([...dependencyGraph(entry)].some((path) => path.includes("/curriculum/catalog/"))).toBe(
      false,
    );
});
