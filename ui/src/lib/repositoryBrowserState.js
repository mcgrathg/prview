const KINDS=new Set(['files','text','symbols','references','type','implementation','neighborhood']);
export function normalizeRepositoryBrowser(value,location,legacySearch='',normalizeLocation) {
  const input=value && typeof value==='object' && !Array.isArray(value) ? value : {};
  return {open:input.open===true,kind:KINDS.has(input.kind) ? input.kind : legacySearch ? 'text' : 'files',
    query:typeof input.query==='string' ? input.query.slice(0,1024) : legacySearch.slice(0,1024),filter:typeof input.filter==='string' ? input.filter.slice(0,200) : '',
    scope:['all','changed','other'].includes(input.scope) ? input.scope : 'all',origin:normalizeLocation(input.origin) ?? location,
    symbol:typeof input.symbol==='string' && /^[A-Za-z_$][A-Za-z0-9_$]{0,199}$/.test(input.symbol) ? input.symbol : '',
    character:Number.isSafeInteger(input.character) && input.character>=0 ? input.character : 0};
}
export function repositoryBrowserRequest(browser) {
  return {kind:browser.kind,query:browser.query,symbol:browser.symbol,path:browser.origin.file,line:browser.origin.line,character:browser.character,rev:browser.origin.rev,base:browser.origin.base};
}
