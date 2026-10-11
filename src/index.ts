import "dotenv/config";
import { createMcpHandler } from "@modelcontextprotocol/server";
import { loadHttpConfig } from "./http/config.js";
import { createHttpServer, HTTP_BODY_MAX_BYTES } from "./http/server.js";
import { buildServer } from "./server.js";

const config = loadHttpConfig();
const handler = createMcpHandler(buildServer, {
  maxRequestBodySize: HTTP_BODY_MAX_BYTES, maxSubscriptions: 16,
  onerror: () => console.error(JSON.stringify({ event: "mcp_error" }))
});
const httpServer = createHttpServer(config, handler, {
  diagnostic: event => console.error(JSON.stringify(event))
});
httpServer.listen(config.port, config.bindHost, () => {
  console.error(JSON.stringify({ event: "listening", mode: config.mode, port: config.port }));
});

let stopping = false;
async function shutdown(): Promise<void> {
  if (stopping) return;
  stopping = true;
  console.error(JSON.stringify({ event: "shutdown" }));
  const timeout = setTimeout(() => { httpServer.closeAllConnections(); process.exit(1); }, 10_000);
  timeout.unref();
  const closed = new Promise<void>(resolve => httpServer.close(() => resolve()));
  await handler.close();
  await closed;
  clearTimeout(timeout);
}

process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());
