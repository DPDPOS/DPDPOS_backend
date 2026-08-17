/**
 * Run API + BullMQ worker in one process group.
 * Used on Render Free (background workers have no free instance).
 */
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "dist");

function run(file) {
  return spawn(process.execPath, [path.join(dist, file)], {
    stdio: "inherit",
    env: process.env,
    cwd: root,
  });
}

const api = run("server.js");
const worker = run("worker.js");
let shuttingDown = false;

function shutdown(signal, code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  api.kill(signal);
  worker.kill(signal);
  setTimeout(() => process.exit(code), 1500).unref();
}

for (const child of [api, worker]) {
  child.on("exit", (code, signal) => {
    if (shuttingDown) return;
    const exitCode = code === 0 || signal ? 0 : (code ?? 1);
    shutdown("SIGTERM", exitCode === 0 ? 1 : exitCode);
  });
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
