import {get,writable} from 'svelte/store';
export const editorRoots=writable(new Map());
const storageKey=repo=>`prview:vscode-root:v1:${repo}`;
export function normalizeEditorRoot(value){
 if(typeof value!=='string' || value.length>4096 || /[\x00-\x1f\x7f]/.test(value))return null;
 let root=value.trim();const windows=/^[a-z]:[\\/]/i.test(root);
 if(windows)root=root.replaceAll('\\','/');
 if((!windows && (!root.startsWith('/') || root.startsWith('//') || /[\\:]/.test(root))) || root.split('/').some(part=>part==='.' || part==='..'))return null;
 root=root.replace(/\/+$/,'');if(windows && /^[a-z]:$/i.test(root))root+='/';return root && root!=='/' ? root : null;
}
export function vscodeFileHref(folder,path,line=1,column=1){
 const root=normalizeEditorRoot(folder);
 if(!root || typeof path!=='string' || !path || path.length>2048 || /[\x00-\x1f\x7f\\:]/.test(path) || path.split('/').some(part=>!part || part==='.' || part==='..') || !Number.isSafeInteger(line) || line<1 || !Number.isSafeInteger(column) || column<1)return null;
 const absolute=(root.startsWith('/')?'':'/')+root.replace(/\/$/,'')+'/'+path;
 return `vscode://file${absolute.split('/').map(encodeURIComponent).join('/')}:${line}:${column}`;
}
function remember(repo,root){editorRoots.update(previous=>new Map(previous).set(repo,root));}
export function loadEditorRoot(repo,storage=null){
 if(get(editorRoots).has(repo))return;
 let root='';try{root=normalizeEditorRoot((storage ?? globalThis.localStorage).getItem(storageKey(repo))) ?? '';}catch{}
 remember(repo,root);
}
export function saveEditorRoot(repo,value,storage=null){
 const root=normalizeEditorRoot(value);if(!root)throw new Error('Enter an absolute local checkout folder, such as /Users/you/code/project.');
 remember(repo,root);
 try{(storage ?? globalThis.localStorage).setItem(storageKey(repo),root);}catch{throw new Error('Folder is available for this visit, but browser storage could not remember it.');}
 return root;
}
