/** Tiny className joiner: cx('a', cond && 'b', undefined) -> 'a b' */
export const cx = (...parts) => parts.flat().filter(Boolean).join(' ');
