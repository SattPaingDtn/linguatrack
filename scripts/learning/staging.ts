// Historical entry point retained only to fail closed after the product decision.
// No configuration is read and no database/project is contacted.
console.error(
  "Second-project staging setup is superseded. Use npm run platform:audit and docs/platform-milestone-1.md. Keep the existing hosted project unchanged; local platform integration is the next milestone.",
);
process.exitCode = 1;
