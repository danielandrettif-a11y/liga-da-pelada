// Load the root-readable runtime configuration before dropping privileges.
const { pathToFileURL } = require('node:url');

process.loadEnvFile('/run/liga/runtime.env');
process.setgid(process.argv[2]);
process.setuid(process.argv[2]);

import(pathToFileURL(process.argv[3]).href).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
