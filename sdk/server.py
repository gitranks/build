# sdk/server.py: my-server again, on the official MCP SDK for Python (the mcp package).
# The SDK reads the messages, answers the hello and the list of tools, and checks each call's input.
import secrets
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


# The same random numbers as your own server: started with --seed 42, the same on every run.
seed_text = sys.argv[sys.argv.index("--seed") + 1] if "--seed" in sys.argv[1:-1] else ""
state = int(seed_text) if seed_text.isdecimal() and 0 < int(seed_text) < 2147483647 else secrets.randbelow(2147483646) + 1


def random_below(n: int) -> int:
    global state
    state = (state * 48271) % 2147483647
    return state % n


mcp = MCPServer("my-server", version="2.0.0")


# One decorator makes a tool: its name is the function's, its description the docstring, its input the arguments.
@mcp.tool()
def roll_dice(sides: int = 6) -> str:
    """Roll a die and say the number. Use it whenever the person asks for a dice roll."""
    return f"You rolled {random_below(sides) + 1}."


# Started as a program, not imported: serve on standard input and output until the agent closes them.
if __name__ == "__main__":
    log("started")
    mcp.run()
