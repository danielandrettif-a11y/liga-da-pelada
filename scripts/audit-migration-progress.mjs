import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const catalog = JSON.parse(readFileSync(join(root, "architecture/application-operations.json"), "utf8"));
const progress = JSON.parse(readFileSync(join(root, "architecture/operation-migration-status.json"), "utf8"));
const keyOf = ({ context, source, name }) => `${context}\u0000${source}\u0000${name}`;
const knownOperations = new Map(catalog.operations.map((operation) => [keyOf(operation), operation]));
const allowedStates = new Set(progress.states);
const overrides = new Map();
const errors = [];

for (const item of progress.overrides) {
  const key = keyOf(item);
  if (!knownOperations.has(key)) errors.push(`Operacao desconhecida no progresso: ${item.context}/${item.name} (${item.source})`);
  if (overrides.has(key)) errors.push(`Operacao duplicada no progresso: ${item.context}/${item.name} (${item.source})`);
  if (!allowedStates.has(item.state)) errors.push(`Estado invalido em ${item.context}/${item.name}: ${item.state}`);
  if (!item.target?.trim()) errors.push(`Destino ausente em ${item.context}/${item.name}`);
  if (!Array.isArray(item.evidence) || item.evidence.length === 0) {
    errors.push(`Evidencia ausente em ${item.context}/${item.name}`);
  } else {
    for (const path of item.evidence) {
      if (!existsSync(join(root, path))) errors.push(`Evidencia inexistente em ${item.context}/${item.name}: ${path}`);
    }
  }
  overrides.set(key, item);
}

const rows = catalog.operations.map((operation) => ({
  ...operation,
  state: overrides.get(keyOf(operation))?.state ?? "planned",
}));
const contexts = [...new Set(rows.map((row) => row.context))].sort();
const totals = Object.fromEntries(["planned", ...progress.states].map((state) => [state, 0]));
for (const row of rows) totals[row.state] += 1;

if (errors.length) {
  for (const error of errors) console.error(error);
  process.exitCode = 1;
} else if (process.argv.includes("--json")) {
  console.log(JSON.stringify({ total: rows.length, totals, contexts: contexts.map((context) => ({
    context,
    total: rows.filter((row) => row.context === context).length,
    migrated: rows.filter((row) => row.context === context && row.state !== "planned").length,
    verified: rows.filter((row) => row.context === context && row.state === "verified").length,
  })) }, null, 2));
} else {
  console.log(`Progresso da migracao: ${rows.length} operacoes; ${totals.planned} planejadas; ${totals["backend-pilot"]} no backend; ${totals["frontend-migrated"]} no frontend; ${totals.verified} verificadas; ${totals.retired} retiradas.`);
  for (const context of contexts) {
    const contextRows = rows.filter((row) => row.context === context);
    const migrated = contextRows.filter((row) => row.state !== "planned").length;
    console.log(`  ${context}: ${migrated}/${contextRows.length}`);
  }
}
