import {test,expect} from 'bun:test';
import {get} from 'svelte/store';
import {editorRoots,loadEditorRoot,saveEditorRoot,vscodeFileHref,normalizeEditorRoot} from './vscodeLinks.js';
test('local file links encode reserved characters and retain the requested one-based position',()=>{
 expect(vscodeFileHref('/Users/you/my repo/','src/日本語 #?.ts',42,5)).toBe('vscode://file/Users/you/my%20repo/src/%E6%97%A5%E6%9C%AC%E8%AA%9E%20%23%3F.ts:42:5');expect(vscodeFileHref('C:\\code\\project','src/main.ts')).toBe('vscode://file/C%3A/code/project/src/main.ts:1:1');expect(vscodeFileHref('C:\\','file.ts')).toBe('vscode://file/C%3A/file.ts:1:1');expect(vscodeFileHref('/repo','literal%2Fname.ts')).toContain('literal%252Fname.ts');
});
test('untrusted file locations cannot escape the chosen folder or replace the editor protocol',()=>{
 for(const path of ['../secret','/absolute','src/../../secret','src\\outside','src/./file','src//file','file.ts:3:4','bad\0file'])expect(vscodeFileHref('/repo',path)).toBeNull();
 for(const root of ['relative','vscode://anything','//remote/share','/repo/../outside','/repo\\outside'])expect(normalizeEditorRoot(root)).toBeNull();expect(vscodeFileHref('/repo','file.ts',0)).toBeNull();expect(vscodeFileHref('/repo','file.ts',1,NaN)).toBeNull();
});
test('explicit checkout mappings remain per repository and storage failure retains the in-memory choice',()=>{
 const data=new Map(),storage={getItem:key=>data.get(key) ?? null,setItem:(key,value)=>data.set(key,value)};
 saveEditorRoot('test/one','/code/one',storage);loadEditorRoot('test/two',storage);expect(get(editorRoots).get('test/one')).toBe('/code/one');expect(get(editorRoots).get('test/two')).toBe('');
 editorRoots.set(new Map());loadEditorRoot('test/one',storage);expect(get(editorRoots).get('test/one')).toBe('/code/one');
 expect(()=>saveEditorRoot('test/one','../invalid',storage)).toThrow();expect(get(editorRoots).get('test/one')).toBe('/code/one');
 expect(()=>saveEditorRoot('test/blocked','/code/blocked',{setItem:()=>{throw new Error('full');}})).toThrow('this visit');expect(get(editorRoots).get('test/blocked')).toBe('/code/blocked');
});
