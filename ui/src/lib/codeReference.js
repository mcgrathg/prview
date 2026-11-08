const KEYWORDS = new Set('as async await break case catch class const continue debugger declare default delete do else enum export extends false finally for from function get if implements import in instanceof interface keyof let module namespace new null of private protected public readonly return satisfies set static super switch this throw true try type typeof undefined var void while with yield'.split(' '));

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
      if (!keywords && KEYWORDS.has(match[0])) return null;
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
