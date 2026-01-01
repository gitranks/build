// prompt.ts: a small prompt to talk to your server by hand. It starts the server for you.
// Type a method, then its params as JSON if it has any, and press Enter:   tools/list
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";

const server = spawn(process.execPath, ["server.ts", ...process.argv.slice(2)], { stdio: ["pipe", "pipe", "inherit"] });
createInterface({ input: server.stdout }).on("line", (line) => console.log("<- " + line));

let id = 0;
const typed = createInterface({ input: process.stdin });
typed.on("line", (line) => {
  const [method, ...rest] = line.trim().split(" ");
  if (!method) return;
  if (method.startsWith("{")) return send(line.trim()); // sent just as you typed it
  let params;
  try {
    params = rest.length ? JSON.parse(rest.join(" ")) : undefined;
  } catch {
    return console.log('Those params are not JSON. Try: initialize {"protocolVersion": "2025-11-25"}');
  }
  // A notification has no id, so the server sends nothing back.
  const note = method.startsWith("notifications/");
  send(JSON.stringify(note ? { jsonrpc: "2.0", method, params } : { jsonrpc: "2.0", id: ++id, method, params }));
});
typed.on("close", () => server.stdin.end());

function send(message: string): void {
  console.log("-> " + message);
  server.stdin.write(message + "\n");
}
