import {test,expect} from 'bun:test';
import {organizationModel,emptyGraph} from '../../../shared/review-organization/model.ts';
import {defaultControls} from '../../../shared/review-organization/machine.ts';
import {explainReviewOrder} from './reviewOrderExplanation.js';
const input=[
 {filename:'src/unbranched.ts',changes:500,patch:'+const answer = 42;'},
 {filename:'src/large.ts',changes:207,patch:'+if (ready) throw new Error();'},
 {filename:'src/tie-b.ts',changes:10,patch:'+if (ready) work();'},
 {filename:'src/tie-a.ts',changes:10,patch:'+if (ready) work();'},
 {filename:'src/no-patch.ts',changes:2,patch:null},
 {filename:'test/large.test.ts',changes:900,patch:'+if (ready) test();'},
 {filename:'README.md',changes:1,patch:'+docs'},
 {filename:'fixtures/app/tsconfig.json',changes:2000,patch:'+{}'},
];
const capture={files:input.map(file=>({...file,status:'modified',additions:file.changes,deletions:0}))};
const model=order=>organizationModel(capture,emptyGraph(),{...defaultControls(),order});
const reason=(state,path,order='attention')=>explainReviewOrder(state.entries.find(entry=>entry.file.filename===path),state.entries,order).join('\n');

test('Attention explanations expose the decisive actual sort keys and the adjacent file',()=>{
 const state=model('attention');expect(state.entries[0].file.filename).toBe('src/large.ts');
 const large=reason(state,'src/large.ts');expect(large).toContain('Attention rank #1 of 8 changed files');expect(large).toContain('Source');expect(large).toContain('207 changed lines (+207 −0)');expect(large).toContain('207 vs 10 changed lines');expect(large).toContain('Not a risk');
 const tie=reason(state,'src/tie-a.ts');expect(tie).toContain('file path breaks an otherwise exact tie');
 const signal=reason(state,'src/tie-b.ts');expect(signal).toContain('Ahead of unbranched.ts');expect(signal.split('\n').find(line=>line.startsWith('Ahead of unbranched.ts'))).toContain('added control-flow text');
 const group=reason(state,'src/no-patch.ts');expect(group).toContain('Ahead of large.test.ts');expect(group).toContain('role group comes first');
});
test('missing patches and overlapping fixture/configuration roles are explained without pretending source was checked',()=>{
 const state=model('attention');expect(reason(state,'src/no-patch.ts')).toContain('Patch unavailable');
 const fixture=reason(state,'fixtures/app/tsconfig.json');expect(fixture).toContain('Fixtures, Configuration');expect(fixture).toContain('supporting data comes last');expect(fixture).toContain('source files only');
});
test('other modes describe their own policy and retain all-file ranks under filtering',()=>{
 const original=model('original'),volume=model('volume');
 expect(reason(original,'src/unbranched.ts','original')).toContain('Captured PR file order');expect(reason(original,'src/unbranched.ts','original')).not.toContain('control-flow');
 expect(reason(volume,'fixtures/app/tsconfig.json','volume')).toContain('Changed lines rank #1');expect(reason(volume,'fixtures/app/tsconfig.json','volume')).not.toContain('comes last');
 const filtered=organizationModel(capture,emptyGraph(),{...defaultControls(),query:'tie-b'});
 expect(filtered.visible).toHaveLength(1);expect(reason(filtered,'src/tie-b.ts')).toContain('of 8 changed files');expect(reason(filtered,'src/tie-b.ts')).toContain('before filters/grouping');
});
test('formatting reasons leaves captured data, engine facts and sort order intact',()=>{
 const state=model('attention'),before=JSON.stringify({state,capture});for(const entry of state.entries)explainReviewOrder(entry,state.entries,'attention');expect(JSON.stringify({state,capture})).toBe(before);
 const single=model('attention');expect(explainReviewOrder(single.entries[0],[single.entries[0]],'attention').join('\n')).not.toContain('Ahead of');
});
