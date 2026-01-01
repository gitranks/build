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

function show(name, file, args, input) {
  const run = spawnSync(process.execPath, [file, ...args], { input: input.map((l) => l + "\n").join(""), encoding: "utf8", timeout: 5000 });
  for (const l of run.stdout.split("\n")) if (l.trim()) console.log(`${name} said: ${l.trim()}`);
  for (const l of run.stderr.split("\n")) if (l.startsWith("my-server: ")) console.log(`${name} logged: ${l.slice(11).trim()}`);
  const crash = run.stderr.split("\n").find((l) => /^[A-Za-z]*Error\b/.test(l));
  if (crash) console.log(`${name} crashed: ${crash.trim()}`);
  if (run.status !== 0) console.log(run.status === null ? `${name} did not stop within 5 seconds` : `${name} stopped with code ${run.status}`);
}

show("server", "server.ts", ["--seed", seed], lines);
