// my-server: an MCP server written from nothing, with no library.
// Your agent starts this program and talks to it in JSON-RPC messages, one message
// on each line: they come in on standard input and go out on standard output.
import { createInterface } from "node:readline";

type Message = { jsonrpc?: unknown; id?: unknown; method?: unknown; params?: any };
type Answer = { result: object } | { error: { code: number; message: string } };

// The versions of MCP this server speaks, newest first.
const VERSIONS = ["2025-11-25", "2025-06-18"];

// Logs go to standard error. Standard output is kept for messages alone.
function log(text: string): void {
  console.error(`my-server: ${text}`);
}

// The tools this server offers. The agent reads each description to decide when to use it.
const ROLL_DICE = {
  name: "roll_dice",
  description: "Roll a die and say the number. Use it whenever the person asks for a dice roll.",
  inputSchema: {
    type: "object",
    properties: {
      sides: { type: "integer", minimum: 2, maximum: 100, description: "How many sides the die has. 6 if not given." },
    },
    additionalProperties: false,
  },
};
const TOOLS = [ROLL_DICE];

function fail(code: number, message: string): Answer {
  return { error: { code, message } };
}

// Every request gets exactly one answer.
function handle(msg: Message): Answer {
  const params = msg.params ?? {};
  if (typeof params !== "object" || Array.isArray(params)) return fail(-32602, "params must be an object");
  if (msg.method === "initialize") {
    // Answer the version the agent asked for if we speak it, else the newest we speak.
    const asked = params.protocolVersion;
    return {
      result: {
        protocolVersion: VERSIONS.includes(asked) ? asked : VERSIONS[0],
        capabilities: { tools: {} },
        serverInfo: { name: "my-server", version: "0.1.0" },
      },
    };
  }
  if (msg.method === "ping") return { result: {} };
  if (msg.method === "tools/list") return { result: { tools: TOOLS } };
  return fail(-32601, `Method not found: ${msg.method}`);
}

// One message is one line of JSON, so each answer is written as one line.
function send(message: object): void {
  process.stdout.write(JSON.stringify(message) + "\n");
}

log("started");
const input = createInterface({ input: process.stdin });
input.on("line", (line) => {
  if (!line.trim()) return;
  let msg: Message;
  try {
    msg = JSON.parse(line);
  } catch {
    log("that line is not JSON");
    return;
  }
  log(`got ${msg.method}`);
  if (!("id" in msg)) return; // a notification: it gets no answer
  send({ jsonrpc: "2.0", id: msg.id, ...handle(msg) });
});
input.on("close", () => log("standard input closed, stopping"));
