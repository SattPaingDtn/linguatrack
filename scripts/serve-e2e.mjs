import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
const next = fileURLToPath(new URL("../node_modules/next/dist/bin/next", import.meta.url));
const env = {
  ...process.env,
  NEXT_DIST_DIR: ".next-e2e",
  NEXT_PUBLIC_SUPABASE_URL: "",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "",
  LINGUATRACK_V2_HISTORY_ENABLED: "false",
  LINGUATRACK_V2_MCQ_ENABLED: "false",
};
let child;
let stopping = false;
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => {
    stopping = true;
    child?.kill(signal);
  });
async function run(args) {
  return await new Promise((resolve, reject) => {
    child = spawn(process.execPath, [next, ...args], { stdio: "inherit", env });
    child.once("error", reject);
    child.once("exit", (code) => {
      if (stopping || code === 0) resolve();
      else reject(new Error(`Next ${args[0]} failed (${code})`));
    });
  });
}
await run(["build"]);
if (!stopping) await run(["start", "--hostname", "127.0.0.1", "--port", "3100"]);
