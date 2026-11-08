import {test,expect} from 'bun:test';
import {sourceEvidence} from './sourceEvidence.js';
const source={repo:'test/repo',file:'code.ts',rev:'a'.repeat(40),base:'b'.repeat(40),lines:Array.from({length:100},(_,i)=>`line ${i+1}`)};
test('long selections retain the complete range while only their excerpt is bounded',()=>{
  const value=sourceEvidence({...source,startLine:2,endLine:80});expect(value.line).toBe(2);expect(value.endLine).toBe(80);expect(value.excerpt.split('\n')).toHaveLength(32);expect(value.truncated).toBe(true);
});
test('an endpoint at the next line start excludes that unselected line',()=>{
  const value=sourceEvidence({...source,startLine:2,endLine:5,endAtLineStart:true});expect(value.endLine).toBe(4);expect(value.excerpt).toBe('line 2\nline 3\nline 4');expect(value.truncated).toBe(false);
});
test('empty and unloaded ranges stay unavailable and oversized source is explicitly shortened',()=>{
  expect(sourceEvidence({...source,startLine:101,endLine:101})).toBeNull();expect(sourceEvidence({...source,lines:[],startLine:1,endLine:1})).toBeNull();
  const value=sourceEvidence({...source,lines:['x'.repeat(9000)],startLine:1,endLine:1});expect(value.endLine).toBe(1);expect(value.excerpt).toHaveLength(8000);expect(value.truncated).toBe(true);
});
