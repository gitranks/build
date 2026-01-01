// The quiet check of a step: it starts your server, sends it messages made from the seed and
// prints what came back. It decides nothing: GitRanks compares the print with what it expects.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";

let n = 1;
for (const ch of process.argv[3] ?? "1") n = (n * 31 + ch.charCodeAt(0)) % 2147483647;
const seed = String(n);
const lines = [];
const said = []; // each line the programs printed, with what it answers: an id, "logged", "prompt" or "always"

function show(name, file, args, input) {
  const run = spawnSync(process.execPath, [file, ...args], { input: input.map((l) => l + "\n").join(""), encoding: "utf8", timeout: 5000 });
  for (const l of run.stdout.split("\n")) if (l.trim()) said.push([name === "server" ? answerId(l) : name, `${name} said: ${l.trim()}`]);
  for (const l of run.stderr.split("\n")) if (l.startsWith("my-server: ")) said.push([name === "server" ? "logged" : name, `${name} logged: ${l.slice(11).trim()}`]);
  if (run.status !== 0) said.push(["always", run.status === null ? `${name} did not stop within 5 seconds` : `${name} stopped with code ${run.status}`]);
}

// The id of the request a line answers, null for an error with no request; "?" for a line that is not an answer.
function answerId(line) {
  try {
    const answer = JSON.parse(line);
    return answer && typeof answer === "object" && !Array.isArray(answer) && "id" in answer ? answer.id : "?";
  } catch {
    return "?";
  }
}

show("server", "server.ts", ["--seed", seed], lines);

// What this step adds is printed whole: the answers it is about (by id), the logs or the prompt. Every other
// line goes into one line with a fingerprint (a hash), so the print stays short. With --all, every line is printed,
// after a first line that says this print is only to look at.
const focus = ["logged"];
const every = process.argv[4] === "--all";
const shown = ([key]) => every || key === "always" || focus.includes(key);
if (every) console.log("all lines, printed with --all: never send this print, send the one without --all");
for (const line of said) if (shown(line)) console.log(line[1]);
const other = said.filter((line) => !shown(line)).map(([, text]) => text);
if (other.length) {
  const digest = createHash("sha256").update(other.join("\n"), "utf8").digest("hex").slice(0, 8);
  console.log(`${other.length} more lines (earlier steps' answers and the logs), fingerprint ${digest}: to see them, add --all at the end of the check command`);
}
