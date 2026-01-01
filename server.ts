// my-server: an MCP server written from nothing, with no library.
// Your agent starts this program and talks to it in JSON-RPC messages, one message
// on each line: they come in on standard input and go out on standard output.
import { createInterface } from "node:readline";

type Message = { jsonrpc?: unknown; id?: unknown; method?: unknown; params?: any };

// Logs go to standard error. Standard output is kept for messages alone.
function log(text: string): void {
  console.error(`my-server: ${text}`);
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
});
input.on("close", () => log("standard input closed, stopping"));
