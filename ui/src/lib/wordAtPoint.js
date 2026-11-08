import { codeReferenceAt } from "./codeReference.js";

const DEFINITION_HIGHLIGHT = "definition-link";
let highlightOwner = null;

function clearDefinitionHighlight(owner) {
  owner.container?.classList.remove("definition-link-hover");
  owner.container = null;
  if (highlightOwner !== owner) return;
  CSS.highlights?.delete(DEFINITION_HIGHLIGHT);
  highlightOwner = null;
}

function showDefinitionHighlight(owner, container, token) {
  if (!CSS.highlights || typeof Highlight === "undefined" || !container.contains(token.node)) return false;
  highlightOwner?.container?.classList.remove("definition-link-hover");
  const range = document.createRange();
  range.setStart(token.node, token.start);
  range.setEnd(token.endNode, token.end);
  CSS.highlights.set(DEFINITION_HIGHLIGHT, new Highlight(range));
  container.classList.add("definition-link-hover");
  owner.container = container;
  highlightOwner = owner;
  return true;
}

// Nearest ancestor that lays out as a block: syntax and word-diff spans inside it are one run of text.
function textBlock(node) {
  let element = node.parentElement;
  while (element?.parentElement && getComputedStyle(element).display.startsWith("inline")) element = element.parentElement;
  return element;
}

// Identifier under the pointer, plus enough context to compute its column. Syntax highlighting and
// word-diff marks split one identifier across text nodes, so the word extends through adjacent nodes.
export function tokenAtPoint(x, y, references = false) {
  const range = document.caretRangeFromPoint?.(x, y);
  const position = range ? { node: range.startContainer, offset: range.startOffset } : document.caretPositionFromPoint?.(x, y);
  const node = position?.node ?? position?.offsetNode;
  const offset = position?.offset;
  if (node?.nodeType !== Node.TEXT_NODE) return null;
  const code = node.parentElement?.closest(".code, .pl-code, .source-code");
  const block = code ?? textBlock(node);
  if (!block) return null;
  const nodes = [];
  const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
  for (let current = walker.nextNode(); current; current = walker.nextNode()) {
    if (current.textContent || current === node) nodes.push(code || textBlock(current) === block ? current : null);
  }
  const index = nodes.indexOf(node);
  if (index < 0) return null;
  let first = index;
  let last = index;
  while (nodes[first - 1]) first--;
  while (nodes[last + 1]) last++;
  const run = nodes.slice(first, last + 1);
  const text = run.map(part => part.textContent).join("");
  const at = run.slice(0, index - first).reduce((length, part) => length + part.textContent.length, 0) + offset;
  const options = { modules: references, keywords: !references };
  const reference = codeReferenceAt(text, at, options) ?? codeReferenceAt(text, at - 1, options);
  if (!reference) return null;
  const point = (column) => {
    for (const part of run) {
      if (column <= part.textContent.length) return { node: part, offset: column };
      column -= part.textContent.length;
    }
    return null;
  };
  const start = point(reference.start);
  const end = point(reference.end);
  if (!start || !end) return null;
  const hit = document.createRange();
  hit.setStart(start.node, start.offset);
  hit.setEnd(end.node, end.offset);
  if (![...hit.getClientRects()].some(rect => x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom)) return null;
  return { word: reference.word, node: start.node, start: start.offset, endNode: end.node, end: end.offset };
}

export function wordAtPoint(x, y) {
  return tokenAtPoint(x, y)?.word ?? null;
}

// 0-based character offset of the token within its rendered line container.
export function columnWithin(container, token) {
  if (!container?.contains(token.node)) return null;
  const range = document.createRange();
  range.setStart(container, 0);
  range.setEnd(token.node, token.start);
  return range.toString().length;
}

export function createDefinitionHover(enabled = () => true, direct = () => false) {
  let pointer = null;
  const owner = { container: null };

  function clear() {
    clearDefinitionHighlight(owner);
  }

  function update(modifierHeld) {
    clear();
    if (!(modifierHeld || direct()) || !pointer?.container || !enabled()) return;
    const token = tokenAtPoint(pointer.x, pointer.y, direct());
    if (!token) return;
    showDefinitionHighlight(owner, pointer.container, token);
  }

  function onMouseMove(event, container) {
    pointer = { x: event.clientX, y: event.clientY, container };
    update(event.ctrlKey || event.metaKey);
  }

  function onMouseLeave() {
    pointer = null;
    clear();
  }

  function onModifier(event) {
    if (event.key !== "Control" && event.key !== "Meta") return;
    update(event.ctrlKey || event.metaKey);
  }

  function destroy() {
    window.removeEventListener("keydown", onModifier);
    window.removeEventListener("keyup", onModifier);
    window.removeEventListener("blur", onMouseLeave);
    clear();
  }

  window.addEventListener("keydown", onModifier);
  window.addEventListener("keyup", onModifier);
  window.addEventListener("blur", onMouseLeave);

  return { onMouseMove, onMouseLeave, destroy };
}
