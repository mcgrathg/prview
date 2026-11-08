export function formatReviewSelection(body, start, end, format) {
  const selected = body.slice(start, end);
  const wrappers = { bold: ['**', '**', 'bold text'], italic: ['_', '_', 'italic text'], code: ['`', '`', 'code'], link: ['[', '](https://)', 'link text'] };
  let text, selectionStart, selectionEnd;
  if (wrappers[format]) {
    const [before, after, placeholder] = wrappers[format];
    const content = selected || placeholder;
    text = before + content + after;
    selectionStart = start + before.length;
    selectionEnd = selectionStart + content.length;
  } else {
    const prefix = format === 'quote' ? '> ' : '- ';
    text = (selected || 'text').split('\n').map(line => prefix + line).join('\n');
    selectionStart = start; selectionEnd = start + text.length;
  }
  return { body: body.slice(0, start) + text + body.slice(end), selectionStart, selectionEnd };
}
