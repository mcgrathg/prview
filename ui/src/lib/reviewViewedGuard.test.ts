import { expect, test } from 'bun:test';
import { canChangeViewed } from './reviewViewedGuard.js';
test('only an explicitly current, confirmed full-PR comparison can change native Viewed', () => {
 const input = { rangeKey:'all', comparison:{head:'h',base:'b'},pullRequest:{headRefOid:'h',baseRefOid:'b'},snapshot:{headOid:'h',baseOid:'b'},state:'ready' };
 expect(canChangeViewed(input)).toBe(true);
 for (const patch of [{rangeKey:'since'},{rangeKey:'cold'},{comparison:{head:'old',base:'b'}},{comparison:{head:'h',base:'old'}},{snapshot:{headOid:'old',baseOid:'b'}},{snapshot:null},{state:'saving'},{state:'error'}]) expect(canChangeViewed({...input,...patch})).toBe(false);
});
