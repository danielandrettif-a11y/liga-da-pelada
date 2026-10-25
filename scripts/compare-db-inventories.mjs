import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

function parseInventory(path) {
  const rows = new Map();
  const content = readFileSync(path, 'utf8').replace(/^\uFEFF/, '');
  for (const [index, rawLine] of content.split(/\r?\n/).entries()) {
    const line = rawLine.trim();
    if (!line) continue;
    const match = /^([a-z_][a-z_0-9]*\.[a-z_][a-z_0-9]*)\t(0|[1-9][0-9]*)$/.exec(line);
    if (!match) throw new Error(`${path}:${index + 1}: formato invalido`);
    if (rows.has(match[1])) throw new Error(`${path}:${index + 1}: tabela duplicada ${match[1]}`);
    rows.set(match[1], BigInt(match[2]));
  }
  for (const required of ['auth.users', 'storage.buckets', 'storage.objects']) {
    if (!rows.has(required)) throw new Error(`${path}: falta ${required}`);
  }
  if (![...rows.keys()].some((name) => name.startsWith('public.'))) {
    throw new Error(`${path}: nenhuma tabela public`);
  }
  return rows;
}

export function compareInventories(sourcePath, destinationPath) {
  const source = parseInventory(sourcePath);
  const destination = parseInventory(destinationPath);
  const differences = [];
  const names = [...new Set([...source.keys(), ...destination.keys()])].sort();
  for (const name of names) {
    const before = source.get(name);
    const after = destination.get(name);
    if (before !== after) {
      differences.push({ table: name, source: before?.toString() ?? 'ausente', destination: after?.toString() ?? 'ausente' });
    }
  }
  return { sourceTables: source.size, destinationTables: destination.size, differences };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (process.argv.length !== 4) {
    console.error('Uso: node scripts/compare-db-inventories.mjs origem.tsv destino.tsv');
    process.exitCode = 2;
  } else {
    try {
      const result = compareInventories(process.argv[2], process.argv[3]);
      if (result.differences.length) {
        console.error(`DIVERGENTE: ${result.differences.length} tabela(s); origem=${result.sourceTables}, destino=${result.destinationTables}`);
        for (const row of result.differences) {
          console.error(`${row.table}\torigem=${row.source}\tdestino=${row.destination}`);
        }
        process.exitCode = 1;
      } else {
        console.log(`OK: ${result.sourceTables} tabelas com contagens identicas`);
      }
    } catch (error) {
      console.error(error.message);
      process.exitCode = 2;
    }
  }
}
