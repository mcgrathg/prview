import { expect, test } from 'bun:test';
import { reviewMode } from './reviewMode.js';

test('ordinary links and saved organization links use the same review workspace', () => {
  for (const search of ['', '?organize=1', '?organize=0', '?unrelated=value']) {
    expect(reviewMode(search)).toEqual({ enhanced: true, investigations: false });
  }
});

test('the explicit legacy fallback takes precedence over enhanced and investigation flags', () => {
  for (const search of ['?legacy=1', '?organize=1&legacy=1', '?legacy=1&investigate=1']) {
    expect(reviewMode(search)).toEqual({ enhanced: false, investigations: false });
  }
  expect(reviewMode('?legacy=0')).toEqual({ enhanced: true, investigations: false });
});

test('repository investigations still require their own explicit opt-in', () => {
  for (const search of ['?investigate=1', '?organize=1&investigate=1']) {
    expect(reviewMode(search)).toEqual({ enhanced: true, investigations: true });
  }
  expect(reviewMode('?investigate=0')).toEqual({ enhanced: true, investigations: false });
});
