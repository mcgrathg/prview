const KEYWORDS = new Set('as async await break case catch class const continue debugger declare default delete do else enum export extends false finally for from function if implements import in instanceof interface keyof let module namespace new null of private protected public readonly return satisfies static super switch this throw true try type typeof undefined var void while with yield'.split(' '));

export function codeReferenceAt(text, offset, { modules = true, keywords = false } = {}) {
  if (modules) {
    const imports = /\b(?:from|import)\s*(['"])([^'"\r\n]+)\1|\b(?:import|require)\s*\(\s*(['"])([^'"\r\n]+)\3/g;
    for (const match of text.matchAll(imports)) {
      const word = match[2] ?? match[4];
      const end = match.index + match[0].length - 1;
      const start = end - word.length;
      if (offset >= start && offset < end) return { word, start, end };
    }
  }
  for (const match of text.matchAll(/[A-Za-z_$][A-Za-z0-9_$]*/g)) {
    if (offset >= match.index && offset < match.index + match[0].length) {
      const member = /\.\s*$/.test(text.slice(0, match.index));
      const accessor = /^(?:get|set)$/.test(match[0]) && /^\s+[A-Za-z_$][\w$]*\s*\(/.test(text.slice(match.index + match[0].length));
      if (!keywords && !member && (KEYWORDS.has(match[0]) || accessor)) return null;
      return { word: match[0], start: match.index, end: match.index + match[0].length };
    }
  }
  return null;
}

export function shouldFollowCodeLink(event, direct, hasSelection) {
  return !event.defaultPrevented && event.button === 0 && event.detail === 1
    && !event.shiftKey && !event.altKey && !hasSelection
    && Boolean(direct || event.ctrlKey || event.metaKey);
}

export function codeLinkAction(event, direct, hasSelection) {
  if (event.altKey && direct && !event.ctrlKey && !event.metaKey && !event.shiftKey
    && !event.defaultPrevented && event.button === 0 && event.detail === 1 && !hasSelection) return 'references';
  if (!shouldFollowCodeLink(event, direct, hasSelection)) return null;
  return direct && !event.ctrlKey && !event.metaKey ? 'inspect' : 'definition';
}

export function referenceOrigin(symbol, path, position, origin, comparison) {
  const side = position.side ?? origin.side ?? 'right';
  return { symbol, path, line: position.line, character: position.character,
    rev: side === 'left' ? origin.base ?? comparison.base : origin.rev ?? comparison.head,
    base: origin.base ?? comparison.base };
}
