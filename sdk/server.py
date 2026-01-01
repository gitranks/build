# sdk/server.py: my-server again, on the official MCP SDK for Python (the mcp package).
# The SDK reads the messages, answers the hello and the list of tools, and checks each call's input.
import site
import sys
from pathlib import Path

# pip put the SDK in the folder packages beside this file. These lines make Python look there first, before any
# package of the same name your Python has already.
sys.path.insert(0, str(Path(__file__).parent / "packages"))
site.addsitedir(str(Path(__file__).parent / "packages"))

from mcp.server import MCPServer


# Logs go to standard error. Standard output is the SDK's, for messages alone.
def log(text: str) -> None:
    print(f"my-server: {text}", file=sys.stderr)


mcp = MCPServer("my-server", version="2.0.0")


# Started as a program, not imported: serve on standard input and output until the agent closes them.
if __name__ == "__main__":
    log("started")
    mcp.run()
