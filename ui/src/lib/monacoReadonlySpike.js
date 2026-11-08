import * as monaco from 'monaco-editor/editor/editor.api.js';
import 'monaco-editor/languages/definitions/typescript/register.js';
import 'monaco-editor/editor/browser/coreCommands.js';
import 'monaco-editor/editor/contrib/find/browser/findController.js';
import 'monaco-editor/editor/contrib/contextmenu/browser/contextmenu.js';
import 'monaco-editor/editor/contrib/hover/browser/hoverContribution.js';
import 'monaco-editor/editor/contrib/gotoSymbol/browser/goToCommands.js';
import 'monaco-editor/editor/standalone/browser/quickAccess/standaloneGotoSymbolQuickAccess.js';
import * as ts from 'monaco-editor/language/typescript/monaco.contribution.js';
import EditorWorker from 'monaco-editor/editor/editor.worker?worker';
import TsWorker from 'monaco-editor/language/typescript/ts.worker?worker';
self.MonacoEnvironment = { getWorker: (_, label) => label === 'typescript' || label === 'javascript' ? new TsWorker() : new EditorWorker() };
ts.typescriptDefaults.setDiagnosticsOptions({ noSemanticValidation: true, noSyntaxValidation: true });
export function createReadonlyEditor(container, { repo, revision, path, content, line = 1 }, onStatus) {
  const uri = monaco.Uri.from({ scheme: 'prview', authority: 'source', path: `/${repo}/${revision}/${path}` });
  const model = monaco.editor.createModel(content, 'typescript', uri);
  const editor = monaco.editor.create(container, { model, readOnly: true, domReadOnly: true, automaticLayout: true, minimap: { enabled: false }, fontSize: 12, theme: 'vs-dark', scrollBeyondLastLine: false, ariaLabel: 'Pinned read-only source', stickyScroll: { enabled: true } });
  editor.setPosition({ lineNumber: line, column: 1 }); editor.revealLineInCenter(line); editor.focus();
  const listener = editor.onDidChangeCursorSelection(() => onStatus({ selected: model.getValueInRange(editor.getSelection()), unchanged: model.getValue() === content, models: monaco.editor.getModels().length, uri: uri.toString() }));
  const status = () => ({ unchanged: model.getValue() === content, models: monaco.editor.getModels().length, uri: uri.toString() });
  return { status, outline: async () => { const getWorker = await ts.getTypeScriptWorker(); const worker = await getWorker(uri); return worker.getNavigationTree(uri.toString()); },
    hover: async () => { const getWorker = await ts.getTypeScriptWorker(); const worker = await getWorker(uri); return worker.getQuickInfoAtPosition(uri.toString(), model.getOffsetAt(editor.getPosition())); },
    symbols: () => { editor.focus(); return editor.getAction('editor.action.quickOutline')?.run(); },
    find: () => { editor.focus(); return editor.getAction('actions.find')?.run(); },
    dispose() { listener.dispose(); editor.dispose(); model.dispose(); return { models: monaco.editor.getModels().length }; },
  };
}
