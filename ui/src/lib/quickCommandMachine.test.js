import { expect, test } from 'bun:test';
import { createActor } from 'xstate';
import { matchingCommands, quickCommandMachine } from './quickCommandMachine.js';

const commands = [
  {id:'attention',title:'Sort files by Attention',keywords:'order'},
  {id:'split',title:'Switch to split diff',keywords:'side by side'},
  {id:'single',title:'Return to single view',disabledReason:'No docked panes.'},
];
test('commands accept the file-picker prefix, case-insensitive titles and action keywords', () => {
  expect(matchingCommands(commands,'> SPLIT').map(item=>item.id)).toEqual(['split']);
  expect(matchingCommands(commands,'side by side').map(item=>item.id)).toEqual(['split']);
  expect(matchingCommands(commands,'Attention').map(item=>item.id)).toEqual(['attention']);
  expect(matchingCommands(commands,'does-not-exist')).toEqual([]);
  expect(matchingCommands(commands,'single')[0].disabledReason).toBe('No docked panes.');
});
test('selection is bounded, queries reset it, and closing discards the prior search', () => {
  const actor=createActor(quickCommandMachine).start();
  actor.send({type:'COMMANDS',commands});
  actor.send({type:'QUERY',query:'ignored while closed'});
  expect(actor.getSnapshot().context.query).toBe('');
  actor.send({type:'OPEN',query:''});
  actor.send({type:'MOVE',delta:50});
  expect(actor.getSnapshot().context.selected).toBe(2);
  actor.send({type:'QUERY',query:'split'});
  expect(actor.getSnapshot().context.selected).toBe(0);
  actor.send({type:'MOVE',delta:-2});
  expect(actor.getSnapshot().context.selected).toBe(0);
  actor.send({type:'COMMANDS',commands:[]});
  expect(matchingCommands(actor.getSnapshot().context.commands,actor.getSnapshot().context.query)).toEqual([]);
  actor.send({type:'CLOSE'});
  expect(actor.getSnapshot().matches('closed')).toBe(true);
  expect(actor.getSnapshot().context.query).toBe('');
  actor.send({type:'COMMANDS',commands});
  actor.send({type:'OPEN',query:'> Attention'});
  expect(matchingCommands(actor.getSnapshot().context.commands,actor.getSnapshot().context.query).map(item=>item.id)).toEqual(['attention']);
  actor.stop();
});
