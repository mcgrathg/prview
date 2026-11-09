import * as monaco from 'monaco-editor/editor/editor.api.js';
import 'monaco-editor/languages/definitions/typescript/register.js';
import 'monaco-editor/languages/definitions/javascript/register.js';
import 'monaco-editor/languages/definitions/html/register.js';
import 'monaco-editor/languages/definitions/markdown/register.js';
import 'monaco-editor/editor/browser/coreCommands.js';
import 'monaco-editor/editor/contrib/find/browser/findController.js';
import 'monaco-editor/editor/contrib/contextmenu/browser/contextmenu.js';
import 'monaco-editor/editor/contrib/clipboard/browser/clipboard.js';
import 'monaco-editor/editor/contrib/hover/browser/hoverContribution.js';
import 'monaco-editor/editor/contrib/stickyScroll/browser/stickyScrollContribution.js';
import EditorWorker from 'monaco-editor/editor/editor.worker?worker';
import {codeLinkAction,codeReferenceAt} from './codeReference.js';
import {sourceEvidence} from './sourceEvidence.js';
import {createSourceInsightSession,escapeInsightMarkdown} from './sourceInsight.js';
self.MonacoEnvironment={getWorker:()=>new EditorWorker()};
const models=new Map();let sequence=0;
const publishModelCount=()=>document.documentElement.dataset.prviewEditorModels=String(monaco.editor.getModels().filter(model=>model.uri.scheme==='prview').length);
const range=value=>new monaco.Range(value.line,value.character+1,value.endLine,value.endCharacter+1);
const kinds={class:monaco.languages.SymbolKind.Class,interface:monaco.languages.SymbolKind.Interface,function:monaco.languages.SymbolKind.Function,method:monaco.languages.SymbolKind.Method,constructor:monaco.languages.SymbolKind.Constructor,enum:monaco.languages.SymbolKind.Enum,module:monaco.languages.SymbolKind.Module};
function symbols(items=[]) {return items.map(item=>({name:item.name,detail:'',kind:kinds[item.kind] ?? monaco.languages.SymbolKind.Variable,tags:[],range:range(item.range),selectionRange:range(item.selection),children:symbols(item.children)}));}
async function insight(model,kind,position,token) {
  const context=models.get(model.uri.toString());if(!context || token.isCancellationRequested)return null;
  const controller=new AbortController(),subscription=token.onCancellationRequested(()=>controller.abort());
  try {const word=position ? model.getWordAtPosition(position)?.word ?? '' : '';return await context.session.query(kind,position ? {line:position.lineNumber,character:position.column-1} : null,word,controller.signal);}
  finally {subscription.dispose();}
}
monaco.languages.registerHoverProvider({scheme:'prview'}, {provideHover:async(model,position,token)=>{
  const result=await insight(model,'hover',position,token);if(!result?.hover)return null;
  return {contents:[{value:escapeInsightMarkdown(result.hover.signature),isTrusted:false,supportHtml:false},...(result.hover.documentation ? [{value:escapeInsightMarkdown(result.hover.documentation),isTrusted:false,supportHtml:false}] : [])]};
}});
monaco.languages.registerDocumentSymbolProvider({scheme:'prview'}, {displayName:'Pinned repository source',provideDocumentSymbols:async(model,token)=>symbols((await insight(model,'outline',null,token))?.outline)});
function language(path) {if(/\.svelte$/.test(path))return 'html';if(/\.[cm]?tsx?$/.test(path))return 'typescript';if(/\.[cm]?jsx?$/.test(path))return 'javascript';if(/\.json$/.test(path))return 'javascript';if(/\.md$/.test(path))return 'markdown';return 'plaintext';}
export function createReadonlySource(container,{repo,revision,base,headRef,path,content,line=1,onInspect,onDefinition,onReferences,onSemantic,onNavigate,onCommand,onVscode,onAnalysis}) {
  const uri=monaco.Uri.from({scheme:'prview',authority:'source',path:`/${repo}/${revision}/${path}`,query:`pane=${++sequence}`});
  const model=monaco.editor.createModel(content,language(path),uri);publishModelCount();
  let session,editor;const subscriptions=[];
  try {
  session=createSourceInsightSession({source:{repo,sha:revision,headRef,path},onState:onAnalysis});models.set(uri.toString(),{session});
  editor=monaco.editor.create(container,{model,readOnly:true,domReadOnly:true,automaticLayout:true,minimap:{enabled:false},fontSize:12,scrollBeyondLastLine:false,ariaLabel:`Pinned source ${path}`,stickyScroll:{enabled:true},occurrencesHighlight:'off',selectionHighlight:false});
  editor.setPosition({lineNumber:Math.min(line,model.getLineCount()),column:1});editor.revealLineInCenter(line);
  function tokenAt(position=editor.getPosition()) {
    if(!position)return null;const text=model.getLineContent(position.lineNumber);
    const token=codeReferenceAt(text,position.column-1) ?? codeReferenceAt(text,Math.max(0,position.column-2));
    return token ? {symbol:token.word,path,position:{line:position.lineNumber,character:token.start,side:'right'}} : null;
  }
  function point() {const position=editor.getPosition(),visible=editor.getScrolledVisiblePosition(position),rect=container.getBoundingClientRect(),scale=rect.width/container.clientWidth || 1;
    return {clientX:rect.left+(visible?.left ?? 12)*scale,clientY:rect.top+((visible?.top ?? 12)+(visible?.height ?? 16))*scale,returnFocus:container.querySelector('textarea')};}
  function action(id,label,run,keybindings,order=1) {subscriptions.push(editor.addAction({id:`prview.${id}`,label,keybindings,contextMenuGroupId:'navigation',contextMenuOrder:order,run}));}
  action('inspect','Symbol card',()=>{const target=tokenAt();if(target)onInspect?.(point(),target,true);},[],1);
  action('info','Symbol info',()=>editor.getAction('editor.action.showHover')?.run(),[],1.5);
  action('definition','Preview definition',()=>{const target=tokenAt();if(target)onInspect?.(point(),target,true,'preview');},[monaco.KeyCode.F12],2);
  action('references','Usages',()=>{const target=tokenAt();if(target)onReferences?.(target.symbol,path,target.position);},[monaco.KeyMod.Shift|monaco.KeyCode.F12],3);
  for(const [intent,label] of [['open','Open in review'],['beside','Open beside']])action(intent,label,()=>{const target=tokenAt();if(target)onInspect?.(point(),target,true,intent);},[],intent==='open' ? 3.4 : 3.5);
  if(onVscode)action('vscode','VS Code',()=>{const position=editor.getPosition();if(position)onVscode({line:position.lineNumber,character:position.column-1});},[],3.8);
  for(const [kind,label] of [['type','Type definition'],['implementation','Find implementations']])action(kind,label,()=>{const target=tokenAt();if(target && /^[A-Za-z_$][\w$]*$/.test(target.symbol))onSemantic?.(kind,target.symbol,path,target.position);},[],4);
  action('outline','File symbols',()=>onSemantic?.('outline','',path,{line:1,character:0}),[monaco.KeyMod.CtrlCmd|monaco.KeyMod.Shift|monaco.KeyCode.KeyO],5);
  if(onCommand){action('files','Find repository file',()=>onCommand('files'),[monaco.KeyMod.CtrlCmd|monaco.KeyCode.KeyP],6);action('search','Search repository',()=>onCommand('text'),[monaco.KeyMod.CtrlCmd|monaco.KeyMod.Shift|monaco.KeyCode.KeyF],7);}
  subscriptions.push(editor.onMouseUp(event=>{
    const original=event.event.browserEvent;
    if(event.target.type===monaco.editor.MouseTargetType.GUTTER_LINE_NUMBERS){if(event.target.position)onNavigate?.({line:event.target.position.lineNumber});return;}
    if(event.target.type!==monaco.editor.MouseTargetType.CONTENT_TEXT || !event.target.position)return;
    const selection=editor.getSelection(),selected=selection && !selection.isEmpty();
    const mode=codeLinkAction(original,true,selected);
    if(!mode){if(original.detail>1 || selected)onInspect?.(null,null);return;}
    const target=tokenAt(event.target.position);if(!target)return;original.preventDefault();
    if(mode==='inspect')onInspect?.(original,target,false);
    else if(mode==='definition')onInspect?.(original,target,false,'open');
    else onReferences?.(target.symbol,path,target.position);
  }));
  return {focus:()=>editor.focus(),setLine(value){editor.setPosition({lineNumber:Math.min(value,model.getLineCount()),column:1});editor.revealLineInCenter(value);},setTheme(name){monaco.editor.setTheme(name==='light' ? 'vs' : 'vs-dark');},
    captureEvidence(){const selection=editor.getSelection();if(!selection)return null;return sourceEvidence({repo,file:path,rev:revision,base,lines:model.getLinesContent(),startLine:selection.startLineNumber,endLine:selection.endLineNumber,endAtLineStart:selection.endColumn===1});},
    status:()=>({uri:uri.toString(),readOnly:editor.getOption(monaco.editor.EditorOption.readOnly),models:models.size}),
    dispose(){session.dispose();models.delete(uri.toString());subscriptions.forEach(subscription=>subscription.dispose());editor.dispose();model.dispose();publishModelCount();},
  };
  }catch(error){session?.dispose();models.delete(uri.toString());subscriptions.forEach(subscription=>subscription.dispose());editor?.dispose();model.dispose();publishModelCount();throw error;}
}
