// The tests of pipe. Each one runs pipe in a folder of its own, on CSV files it writes, and checks what pipe said.
// Run them with: node pipe.test.ts
import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

// Make a folder whose inbox holds these files, start pipe there once for each list of commands, and give back
// everything it printed but its first line. Then remove the folder.
function pipe(files: Record<string, string>, ...runs: string[][]): string[] {
  const dir = fs.mkdtempSync(join(tmpdir(), "pipe-test-"));
  fs.mkdirSync(join(dir, "inbox"));
  for (const [name, text] of Object.entries(files)) fs.writeFileSync(join(dir, "inbox", name), text);
  const input = (commands: string[]) => commands.join("\n") + "\n";
  const said = runs.flatMap((commands) => spawnSync(process.execPath, [join(import.meta.dirname, "pipe.ts")], { cwd: dir, input: input(commands), encoding: "utf8" }).stdout.split("\n").slice(1, -1));
  fs.rmSync(dir, { recursive: true, force: true });
  return said;
}

test("drops the lines it can not trust, and says why", () => {
  const file = "time,host,metric,value\n2026-11-27T10:00:05Z,web-1,cpu,40\n2026-11-27T10:00:65Z,web-1,cpu,41\nweb-1,cpu,42\n";
  assert.deepEqual(pipe({ "a.csv": file }, ["run", "bad"]).slice(1), [
    "run: files 1, kept 1, dropped 2, windows 1, flushes 1",
    "a.csv line 3: bad time: 2026-11-27T10:00:65Z,web-1,cpu,41",
    "a.csv line 4: not 4 fields: web-1,cpu,42",
  ]);
});
