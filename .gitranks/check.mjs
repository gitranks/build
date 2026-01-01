// The quiet check of a step: it starts your server, sends it messages made from the seed and
// prints what came back. It decides nothing: GitRanks compares the print with what it expects.
import { spawnSync } from "node:child_process";

let n = 1;
for (const ch of process.argv[3] ?? "1") n = (n * 31 + ch.charCodeAt(0)) % 2147483647;
const seed = String(n);
const lines = [];
const pick = (list) => list[(n = (n * 48271) % 2147483647 || 1) % list.length];
const call = (id, method, params) => JSON.stringify({ jsonrpc: "2.0", id, method, params });
lines.push(call(1, pick(["hello", "say/hi", "what/now", "roll/please"])), "this line is not JSON");
lines.push(JSON.stringify({ jsonrpc: "2.0", method: pick(["notifications/hello", "notifications/ready"]) }));
const version = pick(["2025-11-25", "2025-06-18", "2024-11-05"]);
lines.push(call(2, "initialize", { protocolVersion: version, capabilities: {}, clientInfo: { name: "check", version: "1" } }));
lines.push(call("odd", pick(["initialize", "ping", "tools/list"]), pick(["oops", [1, 2], 7])));
lines.push(call(3, "ping"));
lines.push(call(4, "tools/list"));
lines.push(call(5, "tools/call", { name: "roll_dice", arguments: { sides: pick([6, 8, 12, 20, null]) } }));
lines.push(call(6, "tools/call", { name: pick(["fly", "roll_die", "dice"]), arguments: {} }));
lines.push(call(7, "tools/call", { name: "roll_dice", arguments: { sides: pick([1, 1000, "six", 2.5]) } }));
lines.push(call(8, "tools/call", { name: "roll_dice", arguments: { count: pick([2, 3, 5]) } }));
lines.push(call(9, "tools/call", { name: "roll_dice", arguments: { sides: 6, count: pick([0, 11, "two"]) } }));
const choices = pick([["tea", "coffee"], ["red", "green", "blue"], ["left", "right", "up", "down"]]);
lines.push(call(10, "tools/call", { name: "pick_one", arguments: { choices } }));
lines.push(call(11, "tools/call", { name: "pick_one", arguments: { choices: pick([["alone"], "tea", [1, 2]]) } }));
lines.push(pick(["null", "[1, 2]", '{"id": 12}', '{"jsonrpc": "2.0", "id": 12}']));

function show(name, file, args, input) {
  const run = spawnSync(process.execPath, [file, ...args], { input: input.map((l) => l + "\n").join(""), encoding: "utf8", timeout: 5000 });
  for (const l of run.stdout.split("\n")) if (l.trim()) console.log(`${name} said: ${l.trim()}`);
  for (const l of run.stderr.split("\n")) if (l.startsWith("my-server: ")) console.log(`${name} logged: ${l.slice(11).trim()}`);
  const crash = run.stderr.split("\n").find((l) => /^[A-Za-z]*Error\b/.test(l));
  if (crash) console.log(`${name} crashed: ${crash.trim()}`);
  if (run.status !== 0) console.log(run.status === null ? `${name} did not stop within 5 seconds` : `${name} stopped with code ${run.status}`);
}

show("server", "server.ts", ["--seed", seed], lines);
show("prompt", "prompt.ts", [], [pick(["tools/list", "ping", "hello/again"])]);
