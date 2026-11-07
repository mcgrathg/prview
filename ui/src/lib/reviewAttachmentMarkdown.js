export function insertReviewAttachment(body, attachment, selection) {
  const alt = attachment.name.replace(/[\\\[\]\r\n]/g, ' ');
  const markdown = attachment.contentType.startsWith('video/') ? `\n\n${attachment.url}\n\n` : `![${alt}](${attachment.url})`;
  return body === selection.body
    ? body.slice(0, selection.start) + markdown + body.slice(selection.end)
    : body + `\n\n${markdown}`;
}
