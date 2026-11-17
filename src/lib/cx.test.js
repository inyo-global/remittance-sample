import { describe, expect, it } from 'vitest';
import { cx } from './cx';

describe('cx', () => {
  it('joins truthy class names with a space', () => {
    expect(cx('a', 'b')).toBe('a b');
  });

  it('drops falsy entries', () => {
    const hidden = false;
    expect(cx('a', hidden && 'b', undefined, null, 0, '', 'c')).toBe('a c');
  });

  it('flattens one level of arrays', () => {
    expect(cx(['a', 'b', null], 'c')).toBe('a b c');
  });

  it('returns an empty string with no input', () => {
    expect(cx()).toBe('');
  });
});
