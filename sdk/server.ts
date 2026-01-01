// sdk/server.ts: my-server again, on the official MCP SDK for TypeScript (@modelcontextprotocol/server).
// The SDK reads the messages, answers the hello and the list of tools, and checks each call's input.
import { McpServer } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import * as z from "zod/v4";

// Logs go to standard error. Standard output is the SDK's, for messages alone.
function log(text: string): void {
  console.error(`my-server: ${text}`);
}

// The same random numbers as your own server: started with --seed 42, the same on every run.
const seedAt = process.argv.indexOf("--seed");
const seed = seedAt > 0 && /^[0-9]+$/.test(process.argv[seedAt + 1] ?? "") ? Number(process.argv[seedAt + 1]) : 0;
let state = seed > 0 && seed < 2147483647 ? seed : Math.floor(Math.random() * 2147483646) + 1;
function randomBelow(n: number): number {
  state = (state * 48271) % 2147483647;
  return state % n;
}

// The SDK calls this to make the server for a connection: its name, its version and its tools.
function createServer(): McpServer {
  const server = new McpServer({ name: "my-server", version: "2.0.0" });
  // A tool: its name, what the agent reads, and a schema of its input. The SDK checks every call against it.
  server.registerTool(
    "roll_dice",
    {
      description: "Roll a die and say the number. Use it whenever the person asks for a dice roll.",
      inputSchema: z.object({ sides: z.int().default(6) }),
    },
    async ({ sides }) => ({ content: [{ type: "text", text: `You rolled ${randomBelow(sides) + 1}.` }] }),
  );
  return server;
}

// Serve on standard input and output until the agent closes them.
serveStdio(createServer);
log("started");
