# my-server: an MCP server written from nothing, with no library.
# Your agent starts this program and talks to it in JSON-RPC messages, one message
# on each line: they come in on standard input and go out on standard output.
import sys


# Logs go to standard error. Standard output is kept for messages alone.
def log(text: str) -> None:
    print(f"my-server: {text}", file=sys.stderr)


log("started. It does nothing yet.")
