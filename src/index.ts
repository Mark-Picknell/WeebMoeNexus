import "dotenv/config";
import { createServer } from "node:http";
import {
  localhostHostValidation,
  localhostOriginValidation,
  toNodeHandler
} from "@modelcontextprotocol/node";
import { createMcpHandler } from "@modelcontextprotocol/server";
import { loadPort } from "./config.js";
import { buildServer } from "./server.js";

const port = loadPort();
const handler = createMcpHandler(buildServer);
const nodeHandler = toNodeHandler(handler);

const validateHost = localhostHostValidation();
const validateOrigin = localhostOriginValidation();

const httpServer = createServer((req, res) => {
  if (!validateHost(req, res) || !validateOrigin(req, res)) return;
  void nodeHandler(req, res);
});

httpServer.listen(port, "127.0.0.1", () => {
  console.error(
    `[WeebMoeNexus] MCP listening on http://127.0.0.1:${port}/mcp`
  );
});

async function shutdown(signal: string): Promise<void> {
  console.error(`[WeebMoeNexus] ${signal}; shutting down.`);
  await handler.close();
  httpServer.close(() => process.exit(0));
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
