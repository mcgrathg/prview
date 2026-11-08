import { describe, expect, test } from "bun:test";
import { definitionsAt, referencesAt, type ShaSource } from "./tsService.ts";

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

  test("module strings open their source file while stale and ordinary strings stay unresolved", () => {
    const line = 'import { shape } from "./shape-tools.js";';
    const src = makeSource({
      "src/shape-tools.ts": "export const shape = 1;\n",
      "src/app.ts": line + '\nconst label = "./shape-tools.js";\n',
    });
    expect(definitionsAt(src, "src/app.ts", "./shape-tools.js", 1, line.indexOf('./shape'))).toEqual([
      { path: "src/shape-tools.ts", line: 1, text: "export const shape = 1;", symbol: "./shape-tools.js" },
    ]);
    expect(definitionsAt(src, "src/app.ts", "./other.js", 1, line.indexOf('./shape'))).toBeNull();
    expect(definitionsAt(src, "src/app.ts", "./shape-tools.js", 2, 15)).toBeNull();
  });

  test("rejects when the clicked token does not match the symbol", () => {
    const src = makeSource({
      "src/app.ts": "export const width = 1;\n",
    });
    expect(definitionsAt(src, "src/app.ts", "height", 1, 13)).toBeNull();
  });
});

describe("referencesAt", () => {
  test("tracks aliases and renamed re-exports while excluding shadowed and unrelated names", () => {
    const files = {
      "src/origin.ts": "export function paint() { return 1; }\n",
      "src/barrel.ts": 'export { paint as draw } from "./origin";\n',
      "src/consumer.ts": 'import { draw as render } from "./barrel";\nrender();\nfunction local(render: () => void) { render(); }\n',
      "src/other.ts": 'export function render() {}\nrender();\n',
    };
    const result = referencesAt(makeSource(files), "src/consumer.ts", "render", 2, 0, Object.keys(files));
    expect(result?.references.some(r => r.path === 'src/origin.ts' && r.line === 1 && r.isDefinition)).toBe(true);
    expect(result?.references.some(r => r.path === 'src/consumer.ts' && r.line === 2 && !r.isDefinition)).toBe(true);
    expect(result?.references.some(r => r.path === 'src/barrel.ts')).toBe(true);
    expect(result?.references.some(r => r.path === 'src/consumer.ts' && r.line === 3)).toBe(false);
    expect(result?.references.some(r => r.path === 'src/other.ts')).toBe(false);
    expect(result?.names).toEqual(expect.arrayContaining(['paint', 'draw', 'render']));
  });

  test("stale coordinates are unavailable and source identity isolates revisions", () => {
    const a = makeSource({ 'src/a.ts': 'export const count = 1;\ncount;\n' });
    const b = makeSource({ 'src/a.ts': 'export const count = 2;\n\ncount;\n' });
    expect(referencesAt(a, 'src/a.ts', 'wrong', 2, 0, ['src/a.ts'])).toBeNull();
    expect(referencesAt(a, 'src/a.ts', 'count', 2, 0, ['src/a.ts'])?.references.map(r => r.line)).toEqual([1, 2]);
    expect(referencesAt(b, 'src/a.ts', 'count', 3, 0, ['src/a.ts'])?.references.map(r => r.line)).toEqual([1, 3]);
  });
});
