import { expect, test } from 'bun:test';
import { createActor } from 'xstate';
import { workspaceMachine } from './workspaceMachine.js';
test('independent panes retain location and layout while focus moves and panes close', () => {
 const a = createActor(workspaceMachine).start();
 a.send({type:'OPEN',location:{file:'a.ts',layout:'unified'}});
 a.send({type:'OPEN',location:{file:'b.ts',layout:'split'}});
 a.send({type:'ACTIVATE',id:'p1'});
 a.send({type:'UPDATE',patch:{line:42}});
 expect(a.getSnapshot().context.panes).toEqual([
  {id:'p1',file:'a.ts',line:42,layout:'unified',view:'diff',side:'right'},
  {id:'p2',file:'b.ts',layout:'split',view:'diff',side:'right'}]);
 a.send({type:'CLOSE',id:'p1'});
 expect(a.getSnapshot().context.active).toBe('p2');
 a.send({type:'RESTORE',panes:[{id:'p7',file:'restored.ts'}],active:'p7'});
 a.send({type:'OPEN',location:{file:'next.ts'}});
 expect(new Set(a.getSnapshot().context.panes.map(p=>p.id)).size).toBe(2);
 a.stop();
});

test('file selection from an auxiliary view updates and focuses one code pane in one transition', () => {
 const a = createActor(workspaceMachine, {input:{panes:[{id:'code',file:'before.ts',view:'diff',layout:'unified'},{id:'files',view:'files'},{id:'other',file:'keep.ts',view:'diff'}],active:'files'}}).start();
 let changes = 0; const sub = a.subscribe(() => changes++);
 a.send({type:'NAVIGATE',id:'code',patch:{file:'after.ts',line:12}});
 expect(changes).toBe(1); expect(a.getSnapshot().context.active).toBe('code');
 expect(a.getSnapshot().context.panes[0]).toEqual({id:'code',file:'after.ts',view:'diff',layout:'unified',line:12});
 expect(a.getSnapshot().context.panes[2].file).toBe('keep.ts'); sub.unsubscribe();a.stop();
});
