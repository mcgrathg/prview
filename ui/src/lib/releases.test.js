import { expect,test } from 'bun:test';
import { RELEASES,CURRENT_RELEASE,RELEASE_SEEN_KEY,unseenReleases,readSeenRelease,acknowledgeRelease } from './releases.js';
const store = initial => {const data=new Map(initial === undefined ? [] : [[RELEASE_SEEN_KEY,initial]]); return {getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value)};};
test('release versions are strictly increasing with dated, nonempty user-facing entries',()=>{
 let previous=0;
 for(const release of RELEASES){expect(Number.isSafeInteger(release.version)).toBe(true);expect(release.version).toBeGreaterThan(previous);expect(release.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);expect(new Date(release.date).toISOString().slice(0,10)).toBe(release.date);expect(release.title.length).toBeGreaterThan(0);expect(release.changes.length).toBeGreaterThan(0);previous=release.version;}
 expect(CURRENT_RELEASE.version).toBe(previous);
});
test('catch-up includes every unseen release newest first, including gaps in version numbers',()=>{
 const releases=[{version:1},{version:2},{version:7},{version:10}];
 expect(unseenReleases(2,releases).map(x=>x.version)).toEqual([10,7]);expect(unseenReleases(0,releases)).toHaveLength(4);expect(unseenReleases(10,releases)).toEqual([]);expect(unseenReleases(99,releases)).toEqual([]);
});
test('first visit shows updates, acknowledgement survives reload and an old tab cannot lower progress',()=>{
 const storage=store();expect(readSeenRelease(storage)).toBe(0);expect(unseenReleases(readSeenRelease(storage)).length).toBeGreaterThan(0);
 expect(acknowledgeRelease(storage)).toBe(true);expect(readSeenRelease(storage)).toBe(CURRENT_RELEASE.version);expect(unseenReleases(readSeenRelease(storage))).toEqual([]);
 acknowledgeRelease(storage,10);acknowledgeRelease(storage,1);expect(readSeenRelease(storage)).toBe(10);
});
test('malformed or unavailable browser storage does not break the changelog',()=>{
 for(const value of ['-1','nope','1.5','9007199254740992'])expect(readSeenRelease(store(value))).toBe(0);
 const unavailable={getItem(){throw Error('blocked');},setItem(){throw Error('blocked');}};
 expect(readSeenRelease(unavailable)).toBe(0);expect(acknowledgeRelease(unavailable)).toBe(false);expect(acknowledgeRelease(null)).toBe(false);
});
