// Load the root-readable runtime configuration before dropping privileges.
const { readFileSync } = require('node:fs');
const { pathToFileURL } = require('node:url');
const { parseEnv } = require('node:util');

Object.assign(
  process.env,
  parseEnv(readFileSync('/run/liga/runtime.env', 'utf8')),
);
process.setgid(process.argv[2]);
process.setuid(process.argv[2]);

import(pathToFileURL(process.argv[3]).href).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
