import {test,expect} from 'bun:test';
import {reviewInsightSummary} from './reviewInsightSummary.js';
const fact={complexityIncreased:true,newCycle:false,complexity:{status:'ok',changes:[{name:'refresh',delta:2,base:{complexity:12},head:{complexity:14}}]},activity:{status:'ok',count:6}};
test('tree markers count evidence categories and explain the measured changes',()=>{
 const summary=reviewInsightSummary(fact);expect(summary.count).toBe(2);expect(summary.title).toContain('refresh: 12 → 14 (+2)');expect(summary.title).toContain('6 observed commits');expect(summary.title).toContain('not a risk score');
});
test('multiple function increases count as one category and cycle scope stays explicit',()=>{
 const summary=reviewInsightSummary({...fact,newCycle:true,complexity:{...fact.complexity,changes:[...fact.complexity.changes,{name:'save',delta:1,base:{complexity:2},head:{complexity:3}}]}});
 expect(summary.count).toBe(3);expect(summary.title).toContain('save: 2 → 3 (+1)');expect(summary.title).toContain('resolved changed-file graph');
});
test('unsupported or unavailable measurements do not manufacture a marker or imply safety',()=>{
 expect(reviewInsightSummary(undefined)).toBeNull();expect(reviewInsightSummary({...fact,complexityIncreased:false,activity:{status:'ok',count:4}})).toBeNull();
 expect(reviewInsightSummary({...fact,complexity:{status:'unavailable'},activity:{status:'unavailable',count:10}})).toBeNull();
 const history=reviewInsightSummary({...fact,complexity:{status:'unsupported'},activity:{status:'ok',count:5}});expect(history.count).toBe(1);expect(history.title).toContain('5 observed commits');
});
