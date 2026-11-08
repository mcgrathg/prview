export function sourceEvidence({repo,file,rev,base,lines,startLine,endLine,endAtLineStart=false}) {
  if(!Number.isSafeInteger(startLine) || !Number.isSafeInteger(endLine) || startLine<1 || startLine>lines.length || endLine<startLine || endLine>lines.length)return null;
  const last=endAtLineStart && endLine>startLine ? endLine-1 : endLine;
  const excerptEnd=Math.min(last,startLine+31);
  const excerpt=lines.slice(startLine-1,excerptEnd).join('\n');
  return {repo,file,rev,base,line:startLine,endLine:last,excerpt:excerpt.slice(0,8000),truncated:last>excerptEnd || excerpt.length>8000};
}
