// The tests of the task API, run with Node's own runner: node --test server.test.ts
import assert from "node:assert/strict";
import { type ChildProcess, spawn } from "node:child_process";
import { afterEach, beforeEach, test } from "node:test";

// Before each test, a server of its own on a free port: no test sees another's tasks. It stops after the test.
let server: ChildProcess;
let port: number;
beforeEach(async () => {
  server = spawn(process.execPath, ["server.ts", "--port", "0"]);
  const first = await new Promise<string>((resolve) => server.stdout!.once("data", (bytes) => resolve(String(bytes))));
  port = Number(first.split(":").at(-1)); // its first line names the port: web: listening on http://localhost:52731
});
afterEach(() => server.kill());

// Send a request, and read the answer: its status code, and its body as JSON.
async function call(method: string, path: string, body?: unknown) {
  const answer = await fetch(`http://127.0.0.1:${port}${path}`, { method, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await answer.text();
  return { status: answer.status, body: text ? JSON.parse(text) : null };
}

test("create a task", async () => {
  const { status, body } = await call("POST", "/api/tasks", { title: "Buy milk" });
  assert.equal(status, 201);
  assert.deepEqual(body, { id: 1, title: "Buy milk", done: false });
});
