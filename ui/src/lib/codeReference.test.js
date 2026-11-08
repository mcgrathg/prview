import { expect, test } from "bun:test";
import { codeReferenceAt, shouldFollowCodeLink, codeLinkAction, referenceOrigin } from "./codeReference.js";

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

test('Alt-click requests references only in enhanced mode while drag and alternate gestures stay inert', () => {
  const event = { button: 0, detail: 1, altKey: true };
  expect(codeLinkAction(event, true, false)).toBe('references');
  expect(codeLinkAction(event, false, false)).toBeNull();
  expect(codeLinkAction(event, true, true)).toBeNull();
  expect(codeLinkAction({ ...event, shiftKey: true }, true, false)).toBeNull();
  expect(codeLinkAction({ button: 0, detail: 1 }, true, false)).toBe('inspect');
});

test('an explicit clicked side wins over the previously selected side when capturing references', () => {
  const comparison = { head: 'head', base: 'base' };
  const origin = { rev: 'head', base: 'base', side: 'left' };
  expect(referenceOrigin('name', 'a.ts', { line: 3, character: 1, side: 'right' }, origin, comparison).rev).toBe('head');
  expect(referenceOrigin('name', 'a.ts', { line: 3, character: 1, side: 'left' }, { ...origin, side: 'right' }, comparison).rev).toBe('base');
  expect(referenceOrigin('name', 'a.ts', { line: 3, character: 1 }, origin, comparison).rev).toBe('base');
});

 test('member names and get/set aliases are actionable while accessor and keyword syntax are not', () => {
  for (const text of ['cache.get(key)', 'cache.set(key, value)', 'cache?.get(key)', 'const get = factory;', 'import { get as set } from "cache";', 'obj.default']) {
    const word = text.includes('default') ? 'default' : text.includes('.set') ? 'set' : 'get';
    expect(codeReferenceAt(text, text.indexOf(word))?.word).toBe(word);
  }
  for (const text of ['get size() {', 'set size(value) {', 'const value = 1;', 'return value;']) expect(codeReferenceAt(text, 1)).toBeNull();
});
 test('ordinary inspection cannot initiate navigation, including double-click and drag selection', () => {
  const click = {button: 0, detail: 1};
  expect(codeLinkAction(click, true, false)).toBe('inspect');
  expect(codeLinkAction({...click, detail: 2}, true, false)).toBeNull();
  expect(codeLinkAction(click, true, true)).toBeNull();
  expect(codeLinkAction({...click, metaKey: true}, true, false)).toBe('definition');
});
