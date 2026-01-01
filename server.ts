// my-server: an MCP server written from nothing, with no library.
// Your agent starts this program and talks to it in JSON-RPC messages, one message
// on each line: they come in on standard input and go out on standard output.

// Logs go to standard error. Standard output is kept for messages alone.
function log(text: string): void {
  console.error(`my-server: ${text}`);
}

log("started. It does nothing yet.");
