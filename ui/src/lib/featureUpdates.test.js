import {expect,test} from 'bun:test';
import {FEATURE_UPDATES,LATEST_UPDATE,FEATURE_SEEN_KEY,unseenUpdates,readSeenUpdate,acknowledgeUpdate} from './featureUpdates.js';
const store=(values=[])=>{const data=new Map(values);return {getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value)};};
test('finished features have fixed increasing timestamp versions, explanations and try-it notes',()=>{
 let previous=0;
 for(const entry of FEATURE_UPDATES){expect(Number.isSafeInteger(entry.version)).toBe(true);expect(entry.version).toBeGreaterThan(1e12);expect(entry.version).toBeGreaterThan(previous);expect(new Date(entry.version).toISOString()).toContain('T');expect(entry.title.length).toBeGreaterThan(0);expect(entry.howToTry.length).toBeGreaterThan(0);expect(entry.changes.length).toBeGreaterThan(0);previous=entry.version;}
 expect(LATEST_UPDATE.version).toBe(previous);
});
test('read progress compares feature timestamps rather than a build time or array index',()=>{
 const updates=[{version:1700000000000},{version:1700000020000},{version:1700000999999}];
 expect(unseenUpdates(1700000000000,updates).map(x=>x.version)).toEqual([1700000999999,1700000020000]);expect(unseenUpdates(1700000999999,updates)).toEqual([]);
 const storage=store();expect(readSeenUpdate(storage)).toBe(0);acknowledgeUpdate(storage);expect(readSeenUpdate(storage)).toBe(LATEST_UPDATE.version);expect(unseenUpdates(readSeenUpdate(storage))).toEqual([]);
 acknowledgeUpdate(storage,LATEST_UPDATE.version+100);acknowledgeUpdate(storage,FEATURE_UPDATES[0].version);expect(readSeenUpdate(storage)).toBe(LATEST_UPDATE.version+100);
});
test('legacy numbered acknowledgement migrates only the existing baseline',()=>{
 const storage=store([['prview:last-seen-release','1']]);expect(readSeenUpdate(storage)).toBe(FEATURE_UPDATES[0].version);expect(unseenUpdates(readSeenUpdate(storage)).length).toBeGreaterThan(0);
 acknowledgeUpdate(storage);storage.setItem('prview:last-seen-release','999');expect(readSeenUpdate(storage)).toBe(LATEST_UPDATE.version);
});
test('blocked and malformed browser storage leave the app usable',()=>{
 for(const value of ['-1','nope','1.5','9007199254740992'])expect(readSeenUpdate(store([[FEATURE_SEEN_KEY,value]]))).toBe(0);
 const blocked={getItem(){throw Error('blocked');},setItem(){throw Error('blocked');}};expect(readSeenUpdate(blocked)).toBe(0);expect(acknowledgeUpdate(blocked)).toBe(false);expect(acknowledgeUpdate(null)).toBe(false);
});
