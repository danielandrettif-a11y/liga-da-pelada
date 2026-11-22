import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const model = JSON.parse(readFileSync(join(root, 'architecture/application-contexts.json'), 'utf8'));

function filesBelow(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? filesBelow(path) : [relative(root, path).replaceAll('\\', '/')];
  });
}

const actualEntrypoints = [
  ...filesBelow(join(root, 'src/lib/actions')).filter((path) => path.endsWith('.ts') && !path.endsWith('.test.ts')),
  ...filesBelow(join(root, 'src/app')).filter((path) =>
    (path.endsWith('/actions.ts') || path.endsWith('-actions.ts') || path.endsWith('/route.ts'))
    && (path.endsWith('/route.ts') ? path.startsWith('src/app/api/internal/') : true)),
].sort();
const actualModules = readdirSync(join(root, 'src/modules'), { withFileTypes: true })
  .filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
const actualPages = filesBelow(join(root, 'src/app')).filter((path) => path.endsWith('/page.tsx')).sort();

const assignedEntrypoints = new Map();
const assignedModules = new Map();
const assignedPages = new Map();
const errors = [];
for (const context of model.contexts) {
  if (!context.id || !context.aggregates?.length) errors.push(`Contexto incompleto: ${context.id ?? '(sem id)'}`);
  for (const path of context.entrypoints ?? []) {
    if (assignedEntrypoints.has(path)) errors.push(`Entrada duplicada: ${path}`);
    assignedEntrypoints.set(path, context.id);
  }
  for (const name of context.sourceModules ?? []) {
    if (assignedModules.has(name)) errors.push(`Modulo duplicado: ${name}`);
    assignedModules.set(name, context.id);
  }
  for (const path of context.pages ?? []) {
    if (assignedPages.has(path)) errors.push(`Pagina duplicada: ${path}`);
    assignedPages.set(path, context.id);
  }
}
for (const path of actualEntrypoints) {
  if (!assignedEntrypoints.has(path)) errors.push(`Entrada sem contexto: ${path}`);
}
for (const path of assignedEntrypoints.keys()) {
  if (!actualEntrypoints.includes(path)) errors.push(`Entrada obsoleta: ${path}`);
}
for (const name of actualModules) {
  if (!assignedModules.has(name)) errors.push(`Modulo sem contexto: ${name}`);
}
for (const name of assignedModules.keys()) {
  if (!actualModules.includes(name)) errors.push(`Modulo obsoleto: ${name}`);
}
for (const path of actualPages) {
  if (!assignedPages.has(path)) errors.push(`Pagina sem contexto: ${path}`);
}
for (const path of assignedPages.keys()) {
  if (!actualPages.includes(path)) errors.push(`Pagina obsoleta: ${path}`);
}

const operations = [];
for (const path of actualEntrypoints) {
  const source = readFileSync(join(root, path), 'utf8');
  for (const match of source.matchAll(/^export\s+(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/gm)) {
    operations.push({ context: assignedEntrypoints.get(path), source: path, name: match[1] });
  }
}
operations.sort((a, b) => a.context.localeCompare(b.context) || a.source.localeCompare(b.source) || a.name.localeCompare(b.name));

if (process.argv.includes('--json')) {
  if (errors.length) {
    for (const error of errors) console.error(error);
    process.exitCode = 1;
  } else {
    console.log(JSON.stringify({ version: 1, operations }, null, 2));
  }
} else {
  const snapshot = JSON.parse(readFileSync(join(root, 'architecture/application-operations.json'), 'utf8'));
  if (JSON.stringify(snapshot.operations) !== JSON.stringify(operations)) {
    errors.push('Operacoes exportadas mudaram: regenere e revise architecture/application-operations.json');
  }

  if (errors.length) {
    for (const error of errors) console.error(error);
    process.exitCode = 1;
  } else {
    console.log(`OK: ${model.contexts.length} contextos, ${actualModules.length} modulos, ${actualPages.length} paginas, ${actualEntrypoints.length} entradas e ${operations.length} funcoes exportadas catalogadas.`);
  }
}
