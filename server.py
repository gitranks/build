# my-server: an MCP server written from nothing, with no library.
# Your agent starts this program and talks to it in JSON-RPC messages, one message
# on each line: they come in on standard input and go out on standard output.
import json
import sys

# Read and write UTF-8 with plain line ends on every system, Windows too.
sys.stdin.reconfigure(encoding="utf-8")
sys.stdout.reconfigure(encoding="utf-8", newline="\n")


# Logs go to standard error. Standard output is kept for messages alone.
def log(text: str) -> None:
    print(f"my-server: {text}", file=sys.stderr)


log("started")
for line in sys.stdin:
    if not line.strip():
        continue
    try:
        msg = json.loads(line)
    except ValueError:
        log("that line is not JSON")
        continue
    log(f"got {msg.get('method')}")
log("standard input closed, stopping")
