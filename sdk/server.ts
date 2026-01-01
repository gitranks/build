// sdk/server.ts: my-server again, on the official MCP SDK for TypeScript (@modelcontextprotocol/server).
// The SDK reads the messages, answers the hello and the list of tools, and checks each call's input.
import { McpServer } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";

// Logs go to standard error. Standard output is the SDK's, for messages alone.
function log(text: string): void {
  console.error(`my-server: ${text}`);
}

// The SDK calls this to make the server for a connection: its name, its version and its tools.
function createServer(): McpServer {
  const server = new McpServer({ name: "my-server", version: "2.0.0" });
  return server;
}

// Serve on standard input and output until the agent closes them.
serveStdio(createServer);
log("started");
