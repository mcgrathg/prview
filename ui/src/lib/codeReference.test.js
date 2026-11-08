import { expect, test } from "bun:test";
import { codeReferenceAt, shouldFollowCodeLink } from "./codeReference.js";

test("code links identify symbols and complete import paths, including punctuation", () => {
  const line = "import { draw as render } from '../shape-tools.js';";
  expect(codeReferenceAt(line, line.indexOf('render'))).toEqual({ word: 'render', start: 17, end: 23 });
  expect(codeReferenceAt(line, line.indexOf('shape'))).toEqual({ word: '../shape-tools.js', start: 32, end: 49 });
  expect(codeReferenceAt("const task = import('@example/tools');", 28)?.word).toBe('@example/tools');
  expect(codeReferenceAt("require('./shape')", 13)?.word).toBe('./shape');
  expect(codeReferenceAt('import { draw }', 2)).toBeNull();
  expect(codeReferenceAt('draw();', 5)).toBeNull();
});

test("direct code clicks preserve selection, alternate clicks and legacy modifier behavior", () => {
  const click = { button: 0, detail: 1 };
  expect(shouldFollowCodeLink(click, true, false)).toBe(true);
  expect(shouldFollowCodeLink(click, false, false)).toBe(false);
  expect(shouldFollowCodeLink({ ...click, metaKey: true }, false, false)).toBe(true);
  expect(shouldFollowCodeLink({ ...click, ctrlKey: true }, false, false)).toBe(true);
  expect(shouldFollowCodeLink(click, true, true)).toBe(false);
  for (const change of [{ shiftKey: true }, { altKey: true }, { button: 2 }, { detail: 2 }, { defaultPrevented: true }]) {
    expect(shouldFollowCodeLink({ ...click, ...change }, true, false)).toBe(false);
  }
});
