// Load the root-readable runtime configuration before dropping privileges.
process.loadEnvFile('/run/liga/runtime.env');
process.setgid(process.argv[2]);
process.setuid(process.argv[2]);
require(process.argv[3]);
