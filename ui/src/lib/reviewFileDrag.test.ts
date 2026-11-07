import { expect, test } from 'bun:test';
import { fileDropPosition } from './reviewFileDrag.js';
test('file drops split at visible edges, group in the center, and cancel outside the workspace', () => {
 const r = {left:100,right:500,top:100,bottom:700,width:400,height:600};
 expect(fileDropPosition(r,110,400)).toBe('left'); expect(fileDropPosition(r,490,400)).toBe('right');
 expect(fileDropPosition(r,300,110)).toBe('top'); expect(fileDropPosition(r,300,690)).toBe('bottom');
 expect(fileDropPosition(r,300,400)).toBe('center'); expect(fileDropPosition(r,50,400)).toBeNull();
});
