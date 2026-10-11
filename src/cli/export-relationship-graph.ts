import { promises as fs } from "node:fs";
import { resolve } from "node:path";
import { projectRelationshipExplorer } from "../ui/relationship-explorer-model.js";
import { renderRelationshipExplorerHtml } from "../ui/relationship-explorer-html.js";

async function main(args: string[]): Promise<void> {
  if (args.length !== 4 || args[0] !== "--input" || args[2] !== "--output" ||
      !args[1]?.trim() || !args[3]?.trim()) {
    throw new Error("Usage: npm run graph:export -- --input <traversal.json> --output <explorer.html>");
  }
  const input = resolve(args[1]), output = resolve(args[3]);
  if (input === output) throw new Error("Input and output paths must be different");
  const info = await fs.stat(input);
  if (!info.isFile() || info.size > 512 * 1024 || info.size === 0) {
    throw new Error("Input must be a nonempty regular JSON file no larger than 512 KiB");
  }
  const raw = JSON.parse(await fs.readFile(input, "utf8")) as unknown;
  const graph = projectRelationshipExplorer(raw);
  const html = renderRelationshipExplorerHtml(graph);
  // A separate output path and exclusive create avoid overwriting the source,
  // existing personal files, or a previous hand-curated visualization.
  await fs.writeFile(output, html, { encoding: "utf8", flag: "wx", mode: 0o600 });
  process.stdout.write("Offline relationship explorer created. Open the output HTML file locally; no network is required.\n");
}
void main(process.argv.slice(2)).catch(() => {
  // Fail closed, without echoing private paths, source strings, or file content.
  process.stderr.write("Offline graph export failed. Check input schema, output path, and permissions.\n");
  process.exitCode = 1;
});
