// my-server: an MCP server written from nothing, with no library.
// Your agent starts this program and talks to it in JSON-RPC messages, one message
// on each line: they come in on standard input and go out on standard output.
import { createInterface } from "node:readline";

type Message = { jsonrpc?: unknown; id?: unknown; method?: unknown; params?: any };
type Answer = { result: object } | { error: { code: number; message: string } };

// The versions of MCP this server speaks, newest first.
const VERSIONS = ["2025-11-25", "2025-06-18"];
const INSTRUCTIONS =
  "my-server rolls dice and picks one of a few options at random. Use roll_dice for any dice roll " +
  "and pick_one when the person cannot decide. Say the result in plain words.";

// Logs go to standard error. Standard output is kept for messages alone.
function log(text: string): void {
  console.error(`my-server: ${text}`);
}

// Dice need random numbers. Started with --seed 42 (1 to 2147483646), the numbers are the same on every run.
const seedAt = process.argv.indexOf("--seed");
const seed = seedAt > 0 && /^[0-9]+$/.test(process.argv[seedAt + 1] ?? "") ? Number(process.argv[seedAt + 1]) : 0;
let state = seed > 0 && seed < 2147483647 ? seed : Math.floor(Math.random() * 2147483646) + 1;
function randomBelow(n: number): number {
  state = (state * 48271) % 2147483647;
  return state % n;
}

// The tools this server offers. The agent reads each description to decide when to use it.
const ROLL_DICE = {
  name: "roll_dice",
  description: "Roll one or more dice and say each number and the total. Use it whenever the person asks for a dice roll.",
  inputSchema: {
    type: "object",
    properties: {
      sides: { type: "integer", minimum: 2, maximum: 100, description: "How many sides each die has. 6 if not given." },
      count: { type: "integer", minimum: 1, maximum: 10, description: "How many dice to roll. 1 if not given." },
    },
    additionalProperties: false,
  },
  outputSchema: {
    type: "object",
    properties: { rolls: { type: "array", items: { type: "integer" } }, total: { type: "integer" } },
    required: ["rolls", "total"],
  },
};
const PICK_ONE = {
  name: "pick_one",
  description: "Pick one of the choices at random. Use it when the person cannot decide between a few options.",
  inputSchema: {
    type: "object",
    properties: {
      choices: { type: "array", items: { type: "string" }, minItems: 2, maxItems: 20, description: "The options to pick from." },
    },
    required: ["choices"],
    additionalProperties: false,
  },
  outputSchema: { type: "object", properties: { choice: { type: "string" } }, required: ["choice"] },
};
const TOOLS = [ROLL_DICE, PICK_ONE];

// The result as data the agent can read field by field, and as JSON text for agents that can not.
function data(value: object): object {
  return { content: [{ type: "text", text: JSON.stringify(value) }], structuredContent: value };
}

// A tool's own error goes back as a result marked isError, so the agent can read it and try again.
function toolError(words: string): object {
  return { content: [{ type: "text", text: words }], isError: true };
}

function rollDice(args: any): object {
  const sides = args.sides ?? 6;
  const count = args.count ?? 1;
  if (!Number.isInteger(sides) || sides < 2 || sides > 100) {
    return toolError(`sides must be a whole number from 2 to 100, not ${JSON.stringify(args.sides)}.`);
  }
  if (!Number.isInteger(count) || count < 1 || count > 10) {
    return toolError(`count must be a whole number from 1 to 10, not ${JSON.stringify(args.count)}.`);
  }
  const rolls = Array.from({ length: count }, () => randomBelow(sides) + 1);
  const total = rolls.reduce((sum, roll) => sum + roll, 0);
  return data({ rolls, total });
}

function pickOne(args: any): object {
  const choices = args.choices;
  if (!Array.isArray(choices) || choices.length < 2 || choices.length > 20 || !choices.every((c) => typeof c === "string")) {
    return toolError("choices must be a list of 2 to 20 pieces of text.");
  }
  return data({ choice: choices[randomBelow(choices.length)] });
}

const RUN = new Map<string, (args: any) => object>([["roll_dice", rollDice], ["pick_one", pickOne]]);

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
        serverInfo: { name: "my-server", version: "1.0.0" },
        instructions: INSTRUCTIONS,
      },
    };
  }
  if (msg.method === "ping") return { result: {} };
  if (msg.method === "tools/list") return { result: { tools: TOOLS } };
  if (msg.method === "tools/call") {
    const run = typeof params.name === "string" ? RUN.get(params.name) : undefined;
    if (!run) return fail(-32602, `Unknown tool: ${JSON.stringify(params.name ?? null)}`);
    const args = params.arguments ?? {};
    if (typeof args !== "object" || Array.isArray(args)) return fail(-32602, "arguments must be an object");
    return { result: run(args) };
  }
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
    return send({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error: that line is not JSON" } });
  }
  if (typeof msg !== "object" || msg === null || msg.jsonrpc !== "2.0" || typeof msg.method !== "string") {
    return send({ jsonrpc: "2.0", id: null, error: { code: -32600, message: "Invalid Request: not a JSON-RPC 2.0 request" } });
  }
  log(`got ${msg.method}`);
  if (!("id" in msg)) return; // a notification: it gets no answer
  try {
    send({ jsonrpc: "2.0", id: msg.id, ...handle(msg) });
  } catch (err) {
    log(`a bug: ${err}`);
    send({ jsonrpc: "2.0", id: msg.id, error: { code: -32603, message: "Internal error" } });
  }
});
input.on("close", () => log("standard input closed, stopping"));
