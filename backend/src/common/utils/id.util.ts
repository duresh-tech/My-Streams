import { v7 as uuidv7 } from 'uuid';

/** Generate a UUIDv7 (time-ordered, index-friendly for MySQL & PostgreSQL). */
export function newId(): string {
  return uuidv7();
}

/** Current UNIX timestamp in seconds. */
export function now(): number {
  return Math.floor(Date.now() / 1000);
}

/**
 * Generate a short, human-readable unique system code.
 * Ex. PRM-MBX2K1-4F7A, ROL-MBX2K1-9C21, USR-MBX2K1-0B3D
 */
export function newSystemCode(prefix: string): string {
  const time = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(16).slice(2, 6).toUpperCase();
  return `${prefix}-${time}-${rand}`;
}
