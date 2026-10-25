import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { compareInventories } from './compare-db-inventories.mjs';

test('compara contagens e identifica tabelas ausentes', () => {
  const dir = mkdtempSync(join(tmpdir(), 'db-inventory-'));
  try {
    const source = join(dir, 'source.tsv');
    const destination = join(dir, 'destination.tsv');
    writeFileSync(source, 'auth.users\t47\npublic.leagues\t3\npublic.matches\t140\nstorage.buckets\t1\nstorage.objects\t0\n');
    writeFileSync(destination, 'auth.users\t47\npublic.leagues\t2\nstorage.buckets\t1\nstorage.objects\t0\n');
    assert.deepEqual(compareInventories(source, destination).differences, [
      { table: 'public.leagues', source: '3', destination: '2' },
      { table: 'public.matches', source: '140', destination: 'ausente' },
    ]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
