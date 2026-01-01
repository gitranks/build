# my-server: an MCP server written from nothing, with no library.
# Your agent starts this program and talks to it in JSON-RPC messages, one message
# on each line: they come in on standard input and go out on standard output.
import json
import secrets
import sys

# Read and write UTF-8 with plain line ends on every system, Windows too.
sys.stdin.reconfigure(encoding="utf-8")
sys.stdout.reconfigure(encoding="utf-8", newline="\n")

# The versions of MCP this server speaks, newest first.
VERSIONS = ["2025-11-25", "2025-06-18"]


# Logs go to standard error. Standard output is kept for messages alone.
def log(text: str) -> None:
    print(f"my-server: {text}", file=sys.stderr)


# Dice need random numbers. Started with --seed 42 (1 to 2147483646), the numbers are the same on every run.
seed_text = sys.argv[sys.argv.index("--seed") + 1] if "--seed" in sys.argv[1:-1] else ""
state = int(seed_text) if seed_text.isdecimal() and 0 < int(seed_text) < 2147483647 else secrets.randbelow(2147483646) + 1


def random_below(n: int) -> int:
    global state
    state = (state * 48271) % 2147483647
    return state % n


# JSON has one kind of number, so 6.0 is the whole number 6, as JavaScript reads it.
def number(text: str) -> int | float:
    value = float(text)
    return int(value) if value.is_integer() else value


# The tools this server offers. The agent reads each description to decide when to use it.
ROLL_DICE = {
    "name": "roll_dice",
    "description": "Roll one or more dice and say each number and the total. Use it whenever the person asks for a dice roll.",
    "inputSchema": {
        "type": "object",
        "properties": {
            "sides": {"type": "integer", "minimum": 2, "maximum": 100, "description": "How many sides each die has. 6 if not given."},
            "count": {"type": "integer", "minimum": 1, "maximum": 10, "description": "How many dice to roll. 1 if not given."},
        },
        "additionalProperties": False,
    },
}
TOOLS = [ROLL_DICE]


# A tool's result is a list of content. Ours is one piece of text.
def text(words: str) -> dict:
    return {"content": [{"type": "text", "text": words}]}


# A tool's own error goes back as a result marked isError, so the agent can read it and try again.
def tool_error(words: str) -> dict:
    return {"content": [{"type": "text", "text": words}], "isError": True}


# True for a whole number from low to high. JSON's true and false are not numbers here.
def whole(value, low: int, high: int) -> bool:
    return type(value) is int and low <= value <= high


def roll_dice(args: dict) -> dict:
    sides = 6 if args.get("sides") is None else args["sides"]
    count = 1 if args.get("count") is None else args["count"]
    if not whole(sides, 2, 100):
        return tool_error(f"sides must be a whole number from 2 to 100, not {to_json(args.get('sides'))}.")
    if not whole(count, 1, 10):
        return tool_error(f"count must be a whole number from 1 to 10, not {to_json(args.get('count'))}.")
    rolls = [random_below(sides) + 1 for _ in range(count)]
    total = sum(rolls)
    return text(f"You rolled {total}." if count == 1 else f"You rolled {', '.join(map(str, rolls))}: {total} in total.")


RUN = {"roll_dice": roll_dice}


def fail(code: int, message: str) -> dict:
    return {"error": {"code": code, "message": message}}


# Every request gets exactly one answer.
def handle(msg: dict) -> dict:
    params = {} if msg.get("params") is None else msg["params"]
    if not isinstance(params, dict):
        return fail(-32602, "params must be an object")
    if msg["method"] == "initialize":
        # Answer the version the agent asked for if we speak it, else the newest we speak.
        asked = params.get("protocolVersion")
        return {
            "result": {
                "protocolVersion": asked if asked in VERSIONS else VERSIONS[0],
                "capabilities": {"tools": {}},
                "serverInfo": {"name": "my-server", "version": "0.1.0"},
            }
        }
    if msg["method"] == "ping":
        return {"result": {}}
    if msg["method"] == "tools/list":
        return {"result": {"tools": TOOLS}}
    if msg["method"] == "tools/call":
        run = RUN.get(params["name"]) if isinstance(params.get("name"), str) else None
        if run is None:
            return fail(-32602, f"Unknown tool: {to_json(params.get('name'))}")
        args = {} if params.get("arguments") is None else params["arguments"]
        if not isinstance(args, dict):
            return fail(-32602, "arguments must be an object")
        return {"result": run(args)}
    return fail(-32601, f"Method not found: {msg['method']}")


# One message is one line of JSON, so each message is written as one line.
def to_json(value) -> str:
    return json.dumps(value, separators=(",", ":"), ensure_ascii=False)


def send(message: dict) -> None:
    sys.stdout.write(to_json(message) + "\n")
    sys.stdout.flush()


log("started")
for line in sys.stdin:
    if not line.strip():
        continue
    try:
        msg = json.loads(line, parse_float=number)
    except ValueError:
        log("that line is not JSON")
        continue
    log(f"got {msg.get('method')}")
    if "id" not in msg:
        continue  # a notification: it gets no answer
    send({"jsonrpc": "2.0", "id": msg["id"], **handle(msg)})
log("standard input closed, stopping")
