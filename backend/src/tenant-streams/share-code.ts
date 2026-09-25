import { randomInt } from 'node:crypto';

/**
 * Alphabet for public share codes: lowercase letters with `i`, `l` and `o`
 * removed, because they are the ones people mistake for `1` and `0` when a
 * link is read aloud or copied off a screen. 23 letters over 6 characters is
 * ~148 million codes, so guessing one is not a practical attack - but the
 * lookup endpoint should still be rate limited, since the whole point is that
 * possession of the code grants access.
 */
export const SHARE_CODE_ALPHABET = 'abcdefghjkmnpqrstuvwxyz';

export const SHARE_CODE_LENGTH = 6;

/** Matches a well-formed code, so a junk path segment never reaches the database. */
export const SHARE_CODE_PATTERN = new RegExp(
  `^[${SHARE_CODE_ALPHABET}]{${SHARE_CODE_LENGTH}}$`,
);

export function isShareCode(value: string): boolean {
  return SHARE_CODE_PATTERN.test(value);
}

/**
 * One candidate code. `randomInt` is used rather than `Math.random()` because
 * the code is the only thing protecting the stream: a predictable sequence
 * would let someone who holds one code derive others.
 */
export function generateShareCode(): string {
  let code = '';
  for (let i = 0; i < SHARE_CODE_LENGTH; i += 1) {
    code += SHARE_CODE_ALPHABET[randomInt(SHARE_CODE_ALPHABET.length)];
  }
  return code;
}

/**
 * A code that is free at the moment it is checked.
 *
 * The unique index is what actually guarantees uniqueness - this loop only
 * keeps the common case from reaching the database as an error. A caller that
 * writes the code must still handle P2002 and retry, because another request
 * can take the same code between the check here and the insert.
 */
export async function generateUniqueShareCode(
  exists: (code: string) => Promise<boolean>,
  attempts = 8,
): Promise<string> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const code = generateShareCode();
    if (!(await exists(code))) return code;
  }
  // 8 collisions in a 148-million space means the table is enormous or the
  // generator is broken; either way, failing loudly beats looping forever.
  throw new Error('Could not allocate a unique share code');
}
