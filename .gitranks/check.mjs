// The quiet check of a step: it starts kv a few times, each time with commands made from the seed, on a log file
// of its own, and prints what kv answered. It decides nothing: GitRanks compares the print with what it expects.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import * as fs from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const step = process.argv[2] ?? "";
let n = 1;
for (const ch of process.argv[3] ?? "1") n = (n * 31 + ch.charCodeAt(0)) % 2147483647;
const pick = (list) => list[(n = (n * 48271) % 2147483647 || 1) % list.length];
const said = []; // each line to print, with the step it is about, or "always"
const folder = fs.mkdtempSync(join(tmpdir(), "kv-check-"));
const FILE = join(folder, "data.log");
const size = () => (fs.existsSync(FILE) ? fs.statSync(FILE).size : 0);

// Start kv once, send it these commands, and keep what it printed. All the sessions together get 20 seconds at
// most, and a kv that does not stop ends the check there: the next sessions would wait for it too.
const deadline = Date.now() + 20000;
let stopped = false;
function session(about, commands) {
  if (stopped) return;
  const timeout = Math.min(5000, deadline - Date.now());
  if (timeout < 500) {
    stopped = true;
    return said.push(["always", "the check ran out of time: kv took too long to answer"]);
  }
  said.push([about, `sent: ${commands.join(" | ") || "nothing"}`]);
  const input = commands.map((command) => command + "\n").join("");
  const run = spawnSync(process.execPath, ["kv.ts", "--file", FILE], { input, encoding: "utf8", timeout });
  for (const line of (run.stdout ?? "").split("\n")) if (line.trim()) said.push([about, line.trimEnd()]);
  // A crash's line, with each path in it cut to its file's name.
  const crash = (run.stderr ?? "").split("\n").find((line) => /^[A-Za-z]*Error\b/.test(line));
  if (crash) said.push(["always", `kv crashed: ${crash.trim().replace(/(['"])[^'"]*[\\/]([^\\/'"]*)\1/g, "$1$2$1")}`]);
  if (run.status === null) {
    stopped = true;
    said.push(["always", "kv did not stop when its input ended, so the check stopped there"]);
  } else if (run.status !== 0) said.push([run.status === 3 ? about : "always", `kv stopped with code ${run.status}`]);
}

session("what-you-will-build", []);
session("read-commands", ["help", "", pick(["fly", "hello", "remember"]) + " away", "exit", "help"]);
try {
  fs.rmSync(folder, { recursive: true, force: true });
} catch {}

// What this step adds is printed whole. Every other line goes into one line with a fingerprint (a hash), so the
// print stays short. With --all, every line is printed, after a first line that says this print is only to look at.
const every = process.argv[4] === "--all";
const shown = ([about]) => every || about === "always" || about === step;
if (every) console.log("all lines, printed with --all: never send this print, send the one without --all");
for (const line of said) if (shown(line)) console.log(line[1]);
const other = said.filter((line) => !shown(line)).map(([, text]) => text);
if (other.length) {
  const digest = createHash("sha256").update(other.join("\n"), "utf8").digest("hex").slice(0, 8);
  console.log(`${other.length} more lines (earlier steps' answers and the logs), fingerprint ${digest}: to see them, add --all at the end of the check command`);
}
