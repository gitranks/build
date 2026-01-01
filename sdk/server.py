# sdk/server.py: my-server again, on the official MCP SDK for Python (the mcp package).
# The SDK reads the messages, answers the hello and the list of tools, and checks each call's input.
import secrets
import site
import sys
from pathlib import Path
from typing import Annotated

# pip put the SDK in the folder packages beside this file. These lines make Python look there first, before any
# package of the same name your Python has already.
sys.path.insert(0, str(Path(__file__).parent / "packages"))
site.addsitedir(str(Path(__file__).parent / "packages"))

from mcp.server import MCPServer
from pydantic import Field


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
def roll_dice(
    sides: Annotated[int, Field(ge=2, le=100, description="How many sides each die has. 6 if not given.")] = 6,
    count: Annotated[int, Field(ge=1, le=10, description="How many dice to roll. 1 if not given.")] = 1,
) -> str:
    """Roll one or more dice and say each number and the total. Use it whenever the person asks for a dice roll."""
    rolls = [random_below(sides) + 1 for _ in range(count)]
    total = sum(rolls)
    return f"You rolled {total}." if count == 1 else f"You rolled {', '.join(map(str, rolls))}: {total} in total."


# Started as a program, not imported: serve on standard input and output until the agent closes them.
if __name__ == "__main__":
    log("started")
    mcp.run()
