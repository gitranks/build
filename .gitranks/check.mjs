// The quiet check of a step: it starts your server, sends it messages made from the seed and
// prints what came back. It decides nothing: GitRanks compares the print with what it expects.
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createInterface } from "node:readline";

let n = 1;
for (const ch of process.argv[3] ?? "1") n = (n * 31 + ch.charCodeAt(0)) % 2147483647;
const seed = String(n);
const lines = [];
const said = []; // each line the programs printed, with what it answers: an id, "logged", "prompt" or "always"
const pick = (list) => list[(n = (n * 48271) % 2147483647 || 1) % list.length];
// The server on the SDK, sdk/server.ts, gets the messages an agent sends, each request with its own id.
const version = pick(["2025-11-25", "2025-06-18", "2024-11-05"]);
const asks = [["initialize", { protocolVersion: version, capabilities: {}, clientInfo: { name: "check", version: "1" } }]];
asks.push(["notifications/initialized"], ["ping"], ["tools/list"], [pick(["hello", "say/hi", "what/now"])]);
asks.push(["tools/call", { name: "roll_dice", arguments: { sides: pick([6, 8, 12, 20]) } }]);
asks.push(["tools/call", { name: pick(["fly", "roll_die", "dice"]), arguments: {} }]);

const compact = (value) => JSON.stringify(value);

// What a schema says about one value: its type, its bounds (none for any whole number at all) and its default.
function kind(schema, bounds = true) {
  let text = String(schema.type ?? "any") + (schema.items ? ` of ${kind(schema.items, bounds)}` : "");
  const [low, high] = [schema.minimum ?? schema.minItems, schema.maximum ?? schema.maxItems];
  if (bounds && low !== undefined && high !== undefined && high < Number.MAX_SAFE_INTEGER) text += ` ${low} to ${high}`;
  return text + ("default" in schema ? `, ${compact(schema.default)} if not given` : "");
}

// The facts of an answer, in a form that does not depend on how the SDK spells its JSON.
function described(method, params, answer) {
  const name = method === "tools/call" ? `${params.name} ${compact(params.arguments)}` : method;
  if (!answer) return [`${name}: no answer in time`];
  if (answer.error) return [`${name}: error ${answer.error.code} ${answer.error.message}`];
  const result = answer.result ?? {};
  if (method === "initialize") {
    const info = result.serverInfo ?? {};
    const offers = Object.keys(result.capabilities ?? {}).sort().join(", ") || "nothing";
    const facts = [`hello: ${result.protocolVersion}, ${info.name} ${info.version}, offers ${offers}`];
    return result.instructions ? [...facts, `instructions: ${result.instructions}`] : facts;
  }
  if (method === "tools/list") {
    const facts = result.tools?.length ? [] : ["tools/list: no tools"];
    for (const tool of result.tools ?? []) {
      facts.push(`tool ${tool.name}: ${tool.description}`);
      const schema = tool.inputSchema ?? {};
      for (const [key, value] of Object.entries(schema.properties ?? {})) {
        const needed = (schema.required ?? []).includes(key) ? ", required" : "";
        facts.push(`  ${key} (${kind(value)}${needed})${value.description ? `: ${value.description}` : ""}`);
      }
      const gives = Object.entries(tool.outputSchema?.properties ?? {});
      if (gives.length) facts.push(`  gives ${gives.map(([key, value]) => `${key} (${kind(value, false)})`).join(", ")}`);
    }
    return facts;
  }
  if (method === "tools/call") {
    const text = (result.content ?? []).map((part) => part.text ?? "").join(" ");
    if (result.isError) {
      const named = Object.keys(params.arguments ?? {}).filter((key) => text.includes(key));
      return [`${name}: error result ${named.length ? `naming ${named.join(", ")}` : `saying ${text.split("\n")[0]}`}`];
    }
    if ("structuredContent" in result) return [`${name}: data ${compact(result.structuredContent)}`];
    return [`${name}: text ${compact(text)}`];
  }
  return [`${name}: ${compact(result)}`];
}

// Each request waits for its answer before the next goes, as an agent does (the SDK may drop a request it is
// still running when its input closes), 15 seconds in all at most.
async function talk(file, args, asks) {
  const server = spawn(process.execPath, [file, ...args], { stdio: "pipe", windowsHide: true });
  const waiting = new Map();
  const errors = [];
  let stopped = false;
  server.stdin.on("error", () => {});
  server.on("error", (error) => errors.push(`Error: ${error.message}`));
  createInterface({ input: server.stderr }).on("line", (line) => errors.push(line));
  createInterface({ input: server.stdout }).on("line", (line) => {
    try {
      waiting.get(JSON.parse(line)?.id)?.(JSON.parse(line));
    } catch {}
  });
  const closed = new Promise((done) => server.on("close", done));
  const ended = new Promise((done) =>
    server.on("exit", (code) => {
      stopped = true;
      for (const answer of waiting.values()) answer(null);
      done(code);
    }),
  );
  const deadline = Date.now() + 15000;
  for (const [at, [method, params]] of asks.entries()) {
    const message = { jsonrpc: "2.0", method, ...(params !== undefined && { params }) };
    if (!method.startsWith("notifications/")) message.id = at + 1;
    const answer = message.id && answerTo(message.id, waiting, deadline);
    server.stdin.write(compact(message) + "\n");
    if (stopped) waiting.get(message.id)?.(null);
    if (answer) for (const line of described(method, params, await answer)) said.push([message.id, line]);
  }
  server.stdin.end();
  const timer = setTimeout(() => server.kill(), 5000);
  const code = await ended;
  clearTimeout(timer);
  // Its last lines, up to a second: a program it started itself may hold its output open longer.
  let wait;
  await Promise.race([closed, new Promise((done) => (wait = setTimeout(done, 1000)))]);
  clearTimeout(wait);
  server.stdout.destroy();
  server.stderr.destroy();
  for (const line of errors) if (line.startsWith("my-server: ")) said.push(["logged", `logged: ${line.slice(11).trim()}`]);
  const crash = errors.find((line) => /^[A-Za-z]*Error\b/.test(line));
  if (crash) said.push(["always", `crashed: ${crashed(crash.trim())}`]);
  if (code !== 0) said.push(["always", code === null ? "did not stop within 5 seconds" : `stopped with code ${code}`]);
}

// A crash's line with no path of the machine in it. A package that is not there means the setup has not run.
function crashed(line) {
  const missing = line.match(/Cannot find package '([^']+)'/);
  if (missing) return `a package is not installed (${missing[1]}): run the setup, .gitranks/setup.mjs, then the check again`;
  return line.replace(/ imported from .*$/, "");
}

// The answer with this id, or null when none comes in time.
function answerTo(id, waiting, deadline) {
  return new Promise((done) => {
    const timer = setTimeout(() => waiting.get(id)?.(null), Math.max(10, deadline - Date.now()));
    waiting.set(id, (answer) => {
      clearTimeout(timer);
      waiting.delete(id);
      done(answer);
    });
  });
}

await talk("sdk/server.ts", ["--seed", seed], asks);

// What this step adds is printed whole: the answers it is about (by id), the logs or the prompt. Every other
// line goes into one line with a fingerprint (a hash), so the print stays short. With --all, every line is printed,
// after a first line that says this print is only to look at.
const focus = [4, 6, 7];
const every = process.argv[4] === "--all";
const shown = ([key]) => every || key === "always" || focus.includes(key);
if (every) console.log("all lines, printed with --all: never send this print, send the one without --all");
for (const line of said) if (shown(line)) console.log(line[1]);
const other = said.filter((line) => !shown(line)).map(([, text]) => text);
if (other.length) {
  const digest = createHash("sha256").update(other.join("\n"), "utf8").digest("hex").slice(0, 8);
  console.log(`${other.length} more lines (earlier steps' answers and the logs), fingerprint ${digest}: to see them, add --all at the end of the check command`);
}
