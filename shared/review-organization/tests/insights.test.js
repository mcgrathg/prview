import {test,expect} from 'bun:test';
import {createActor,fromPromise} from 'xstate';
import {captureFromDiff} from '../capture.ts';
import {organizationModel,emptyGraph} from '../model.ts';
import {defaultControls,organizationMachine} from '../machine.ts';
import {normalizeReviewControls,buildReviewHash,parseReviewRoute} from '../../../ui/src/lib/reviewRoute.js';
const base='a'.repeat(40),head='b'.repeat(40);
const native=[{path:'a.ts',additions:100,deletions:0,hunks:[]},{path:'b.ts',additions:2,deletions:0,hunks:[]},{path:'c.ts',additions:1,deletions:0,hunks:[]}];
const capture=captureFromDiff('sample/project',1,base,head,native);
const facts={'a.ts':{score:4,complexityIncreased:true,newCycle:false},'b.ts':{score:20,complexityIncreased:false,newCycle:true},'c.ts':{score:null,complexityIncreased:true,newCycle:false}};
test('hotspots use measured evidence rather than change size, keep unknowns last and preserve global filtered ranks',()=>{
 const controls={...defaultControls(),order:'hotspots',folders:false};
 const full=organizationModel(capture,emptyGraph(),controls,facts);expect(full.paths).toEqual(['b.ts','a.ts','c.ts']);
 const filtered=organizationModel(capture,emptyGraph(),{...controls,insightFilters:['complexity']},facts);expect(filtered.visible.map(entry=>[entry.file.filename,entry.rank])).toEqual([['a.ts',2],['c.ts',3]]);
 expect(organizationModel(capture,emptyGraph(),{...controls,insightFilters:['cycle']},facts).paths).toEqual(['b.ts']);
 expect(organizationModel(capture,emptyGraph(),{...controls,insightFilters:['cycle','complexity']},facts).paths).toEqual([]);
 for(const order of ['path','attention','original','volume','flow'])expect(organizationModel(capture,emptyGraph(),{...defaultControls(),order},facts).entries).toHaveLength(3);
});
test('insight controls round-trip, discard unknown filters and clearing restored controls cannot retain hidden filters',()=>{
 const controls=normalizeReviewControls({order:'hotspots',insightFilters:['cycle','bad','complexity','cycle']});expect(controls.insightFilters).toEqual(['complexity','cycle']);
 const route=parseReviewRoute(buildReviewHash('sample/project',1,{rev:head,base,controls}));expect(route.review.controls).toEqual(controls);
 const actor=createActor(organizationMachine.provide({actors:{load:fromPromise(()=>new Promise(()=>{}))}}),{input:{comparison:{repo:'sample/project',number:1,base,head}}}).start();
 actor.send({type:'INSIGHT.FILTER',filter:'complexity'});expect(actor.getSnapshot().context.insightFilters).toEqual(['complexity']);
 actor.send({type:'CONTROLS.RESTORE',controls:defaultControls()});expect(actor.getSnapshot().context.insightFilters).toBeUndefined();
 actor.send({type:'INSIGHT.FILTER',filter:'cycle'});actor.send({type:'SHOW_ALL'});expect(actor.getSnapshot().context.insightFilters).toBeUndefined();actor.stop();
});
