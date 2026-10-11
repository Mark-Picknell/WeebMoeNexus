import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const root = fileURLToPath(new URL("../", import.meta.url));
function discover(directory) {
  return readdirSync(new URL(directory, new URL("../", import.meta.url)), { withFileTypes: true })
    .flatMap(entry => entry.isDirectory() ? discover(`${directory}${entry.name}/`)
      : entry.name.endsWith(".test.ts") ? [`${directory}${entry.name}`] : []);
}
const files = discover("test/").sort();
if (!files.length) throw new Error("No offline test files discovered");
const child = spawn(process.execPath, ["--import", "tsx", "--test", "--test-reporter=./scripts/offline-reporter.mjs", ...files],
  { cwd: root, stdio: "inherit", env: process.env });
child.on("error", () => { console.error("Offline test runner could not start."); process.exitCode = 1; });
child.on("exit", (code, signal) => { process.exitCode = signal ? 1 : code ?? 1; });
