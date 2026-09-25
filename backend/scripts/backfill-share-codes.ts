/**
 * Gives every existing stream a public share code.
 *
 *   npm run backfill:share-codes
 *
 * The column was added nullable because rows already existed and the unique
 * index would reject a single shared default. New streams get a code at
 * creation, so this only has to run once, after `prisma db push`. Idempotent:
 * rows that already have a code are skipped, so a re-run after a partial
 * failure picks up where it stopped.
 */
import { PrismaClient } from '@prisma/client';
import { randomInt } from 'node:crypto';

const prisma = new PrismaClient();

// Kept in step with backend/src/tenant-streams/share-code.ts. Duplicated
// rather than imported so the script runs without the Nest module graph.
const ALPHABET = 'abcdefghjkmnpqrstuvwxyz';
const LENGTH = 6;

function generate(): string {
  let code = '';
  for (let i = 0; i < LENGTH; i += 1) code += ALPHABET[randomInt(ALPHABET.length)];
  return code;
}

async function main() {
  const pending = await prisma.tenantStream.findMany({
    where: { shareCode: null },
    select: { id: true, name: true },
  });

  if (pending.length === 0) {
    console.log('Every stream already has a share code. Nothing to do.');
    return;
  }

  console.log(`Assigning share codes to ${pending.length} stream(s)...`);
  let assigned = 0;

  for (const stream of pending) {
    // The unique index is the real guard; retry on collision rather than
    // pre-checking, which would still race against a concurrent create.
    let written = false;
    for (let attempt = 0; attempt < 8 && !written; attempt += 1) {
      try {
        await prisma.tenantStream.update({
          where: { id: stream.id },
          data: { shareCode: generate() },
        });
        written = true;
        assigned += 1;
      } catch (error) {
        const code = (error as { code?: string }).code;
        if (code !== 'P2002') throw error;
      }
    }
    if (!written) console.error(`  could not allocate a code for ${stream.name} (${stream.id})`);
  }

  console.log(`Done. ${assigned} of ${pending.length} stream(s) updated.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
