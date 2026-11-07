import { describe, expect, test } from "bun:test";
import { definitionsAt, type ShaSource } from "./tsService.ts";

let keySeq = 0;

function makeSource(files: Record<string, string>): ShaSource {
  const key = `tsservice-test-${++keySeq}`;
  return {
    key,
    paths: () => Object.keys(files),
    readFile: (path) => files[path] ?? null,
  };
}

describe("definitionsAt", () => {
  test("shadowed parameter wins over module-level export", () => {
    const src = makeSource({
      "src/app.ts": [
        "export const width = 1;",
        "export function draw(width: number) {",
        "  return width * 2;",
        "}",
        "",
      ].join("\n"),
    });
    const defs = definitionsAt(src, "src/app.ts", "width", 3, 9);
    expect(defs).toEqual([
      { path: "src/app.ts", line: 2, text: "export function draw(width: number) {", symbol: "width" },
    ]);
  });

  test("aliased import resolves to the original declaration", () => {
    const src = makeSource({
      "src/lib.ts": "export function original() {\n  return 1;\n}\n",
      "src/app.ts": 'import { original as alias } from "./lib.ts";\nexport const v = alias();\n',
    });
    const defs = definitionsAt(src, "src/app.ts", "alias", 2, 17);
    expect(defs?.some((d) => d.path === "src/lib.ts" && d.line === 1)).toBe(true);
  });

  test("an unresolved renamed type import is not its own definition", () => {
    const src = makeSource({
      "src/app.ts": 'import { type ESTreeNode as Node } from "missing/internal/ast";\nexport const visit = (node: Node) => node;\n',
    });
    expect(definitionsAt(src, "src/app.ts", "Node", 1, 28)).toBeNull();
    expect(definitionsAt(src, "src/app.ts", "Node", 2, 28)).toBeNull();
  });

  test("a package export condition follows renamed types to their declaration", () => {
    const src = makeSource({
      "tsconfig.json": '{ "extends": "./config/base.json" }',
      "config/base.json": '{ "compilerOptions": { "customConditions": ["code"] } }',
      "packages/ast/package.json": JSON.stringify({
        name: "@example/ast",
        exports: { "./internal/ast": { types: "./dist/ast.d.ts", code: "./src/index.ts", default: "./dist/ast.js" } },
      }),
      "packages/ast/src/index.ts": 'export type { Node as ESTreeNode } from "./ast";\n',
      "packages/ast/src/ast.ts": 'export type Node = { kind: string };\n',
      "src/app.ts": 'import { type ESTreeNode as Node } from "@example/ast/internal/ast";\nexport const visit = (node: Node) => node;\n',
    });
    const expected = [{ path: "packages/ast/src/ast.ts", line: 1, text: "export type Node = { kind: string };", symbol: "Node" }];
    expect(definitionsAt(src, "src/app.ts", "Node", 1, 28)).toEqual(expected);
    expect(definitionsAt(src, "src/app.ts", "Node", 2, 28)).toEqual(expected);
  });

  test("package source conditions must be enabled and package names unique", () => {
    const files = {
      "packages/ast/package.json": JSON.stringify({ name: "ast", exports: { ".": { code: "./index.ts" } } }),
      "packages/ast/index.ts": "export type ESTreeNode = { kind: string };\n",
      "src/app.ts": 'import { type ESTreeNode as Node } from "ast";\nexport const visit = (node: Node) => node;\n',
    };
    expect(definitionsAt(makeSource(files), "src/app.ts", "Node", 2, 28)).toBeNull();
    expect(definitionsAt(makeSource({
      ...files,
      "tsconfig.json": '{ "compilerOptions": { "customConditions": ["code"] } }',
      "examples/ast/package.json": JSON.stringify({ name: "ast", exports: "./index.ts" }),
      "examples/ast/index.ts": "export type ESTreeNode = { unrelated: true };\n",
    }), "src/app.ts", "Node", 2, 28)).toBeNull();
  });

  test("type aliases through tsconfig paths still resolve", () => {
    const src = makeSource({
      "tsconfig.json": '{ "compilerOptions": { "paths": { "@ast/*": ["src/*"] } } }',
      "src/ast.ts": "export type ESTreeNode = { kind: string };\n",
      "src/app.ts": 'import { type ESTreeNode as Node } from "@ast/ast";\nexport const visit = (node: Node) => node;\n',
    });
    expect(definitionsAt(src, "src/app.ts", "Node", 2, 28)).toEqual([
      { path: "src/ast.ts", line: 1, text: "export type ESTreeNode = { kind: string };", symbol: "ESTreeNode" },
    ]);
  });

  test("member access resolves to the method declaration", () => {
    const src = makeSource({
      "src/shape.ts": "export class Shape {\n  area() {\n    return 0;\n  }\n}\n",
      "src/app.ts": 'import { Shape } from "./shape.ts";\nexport const a = new Shape().area();\n',
    });
    const defs = definitionsAt(src, "src/app.ts", "area", 2, 29);
    expect(defs).toEqual([{ path: "src/shape.ts", line: 2, text: "area() {", symbol: "area" }]);
  });

  test("rejects when the clicked token does not match the symbol", () => {
    const src = makeSource({
      "src/app.ts": "export const width = 1;\n",
    });
    expect(definitionsAt(src, "src/app.ts", "height", 1, 13)).toBeNull();
  });
});
