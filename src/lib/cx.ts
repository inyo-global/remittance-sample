export type ClassValue = string | number | false | null | undefined | ClassValue[];

/** Tiny className joiner: cx('a', cond && 'b', undefined) -> 'a b' */
export const cx = (...parts: ClassValue[]): string => parts.flat().filter(Boolean).join(' ');
