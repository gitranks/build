# The quiet check of a step: it starts your server, sends it messages made from the seed and
# prints what came back. It decides nothing: GitRanks compares the print with what it expects.
import hashlib
import json
import os
import queue
import re
import subprocess
import sys
import threading
import time

n = 1
for ch in sys.argv[2] if len(sys.argv) > 2 else "1":
    n = (n * 31 + ord(ch)) % 2147483647
seed = str(n)
lines = []
said = []  # each line the programs printed, with what it answers: an id, "logged", "prompt" or "always"


def pick(options):
    global n
    n = (n * 48271) % 2147483647 or 1
    return options[n % len(options)]
# The server on the SDK, sdk/server.py, gets the messages an agent sends, each request with its own id.
version = pick(["2025-11-25", "2025-06-18", "2024-11-05"])
asks = [("initialize", {"protocolVersion": version, "capabilities": {}, "clientInfo": {"name": "check", "version": "1"}})]
asks += [("notifications/initialized", None), ("ping", None), ("tools/list", None), (pick(["hello", "say/hi", "what/now"]), None)]
asks += [("tools/call", {"name": "roll_dice", "arguments": {"sides": pick([6, 8, 12, 20])}})]
asks += [("tools/call", {"name": pick(["fly", "roll_die", "dice"]), "arguments": {}})]
asks += [("tools/call", {"name": "roll_dice", "arguments": {"sides": pick([1, 1000, "six", 2.5])}})]
asks += [("tools/call", {"name": "roll_dice", "arguments": {"count": pick([2, 3, 5])}})]
asks += [("tools/call", {"name": "roll_dice", "arguments": {"sides": 6, "count": pick([0, 11, "two"])}})]
choices = pick([["tea", "coffee"], ["red", "green", "blue"], ["left", "right", "up", "down"]])
asks += [("tools/call", {"name": "pick_one", "arguments": {"choices": choices}})]
asks += [("tools/call", {"name": "pick_one", "arguments": {"choices": pick([["alone"], "tea", [1, 2]])}})]


def compact(value):
    return json.dumps(value, separators=(",", ":"), ensure_ascii=False)


# What a schema says about one value: its type, its bounds (none for any whole number at all) and its default.
def kind(schema, bounds=True):
    text = str(schema.get("type", "any")) + (" of " + kind(schema["items"], bounds) if "items" in schema else "")
    low, high = schema.get("minimum", schema.get("minItems")), schema.get("maximum", schema.get("maxItems"))
    if bounds and low is not None and high is not None and high < 2**53 - 1:
        text += f" {low} to {high}"
    return text + (f", {compact(schema['default'])} if not given" if "default" in schema else "")


# The facts of an answer, in a form that does not depend on how the SDK spells its JSON.
def described(method, params, answer):
    name = params["name"] + " " + compact(params.get("arguments")) if method == "tools/call" else method
    if answer is None:
        return [f"{name}: no answer in time"]
    if "error" in answer:
        return [f"{name}: error {answer['error'].get('code')} {answer['error'].get('message')}"]
    result = answer.get("result", {})
    if method == "initialize":
        info, offers = result.get("serverInfo", {}), ", ".join(sorted(result.get("capabilities", {}))) or "nothing"
        facts = [f"hello: {result.get('protocolVersion')}, {info.get('name')} {info.get('version')}, offers {offers}"]
        return facts + ([f"instructions: {result['instructions']}"] if result.get("instructions") else [])
    if method == "tools/list":
        facts = [] if result.get("tools") else ["tools/list: no tools"]
        for tool in result.get("tools", []):
            facts.append(f"tool {tool.get('name')}: {tool.get('description')}")
            schema = tool.get("inputSchema", {})
            for key, value in schema.get("properties", {}).items():
                needed = ", required" if key in schema.get("required", []) else ""
                facts.append(f"  {key} ({kind(value)}{needed})" + (f": {value['description']}" if "description" in value else ""))
            gives = tool.get("outputSchema", {}).get("properties", {})
            if gives:
                facts.append("  gives " + ", ".join(f"{key} ({kind(value, False)})" for key, value in gives.items()))
        return facts
    if method == "tools/call":
        text = " ".join(part.get("text", "") for part in result.get("content", []))
        if result.get("isError"):
            named = [key for key in params.get("arguments", {}) if key in text]
            return [f"{name}: error result " + (f"naming {', '.join(named)}" if named else f"saying {text.splitlines()[0]}")]
        if "structuredContent" in result:
            return [f"{name}: data {compact(result['structuredContent'])}"]
        return [f"{name}: text {compact(text)}"]
    return [f"{name}: {compact(result)}"]


# Pipes, read on their own threads: each request waits for its answer before the next goes, as an agent does
# (the SDK may drop a request it is still running when its input closes), 15 seconds in all at most.
def talk(file, args, asks):
    env = {**os.environ, "PYTHONIOENCODING": "utf-8"}
    pipes = {"stdin": subprocess.PIPE, "stdout": subprocess.PIPE, "stderr": subprocess.PIPE}
    server = subprocess.Popen([sys.executable, file, *args], **pipes, text=True, encoding="utf-8", errors="replace", env=env)
    answers, errors = queue.Queue(), []
    threading.Thread(target=lambda: [*map(answers.put, server.stdout), answers.put(None)], daemon=True).start()
    reading = threading.Thread(target=lambda: errors.extend(server.stderr), daemon=True)
    reading.start()
    deadline = time.monotonic() + 15
    for id, (method, params) in enumerate(asks, 1):
        message = {"jsonrpc": "2.0", "method": method, **({"params": params} if params is not None else {})}
        if not method.startswith("notifications/"):
            message["id"] = id
        try:
            server.stdin.write(compact(message) + "\n")
            server.stdin.flush()
        except OSError:
            pass
        if "id" in message:
            said.extend((id, line) for line in described(method, params, answer_to(id, answers, deadline)))
    try:
        server.stdin.close()  # fails when the server has stopped already: that is not a hang
    except OSError:
        pass
    try:
        code = server.wait(5)
    except subprocess.TimeoutExpired:
        server.kill()
        code = None
    reading.join(1)
    for line in errors:
        if line.startswith("my-server: "):
            said.append(("logged", f"logged: {line[11:].strip()}"))
    if any(line.startswith("Traceback") for line in errors):
        said.append(("always", f"crashed: {crashed([line for line in errors if line.strip()][-1].strip())}"))
    if code is None:
        said.append(("always", "did not stop within 5 seconds"))
    elif code != 0:
        said.append(("always", f"stopped with code {code}"))


# A crash's last line with no path of the machine in it. A module that is not there means the setup has not run.
def crashed(line):
    if line.startswith("ModuleNotFoundError: "):
        missing = line[len("ModuleNotFoundError: "):]
        return f"a package is not installed ({missing}): run the setup, .gitranks/setup.py, then the check again"
    return re.sub(r" \([^()]*[\\/][^()]*\)$", "", line)


# The answer with this id, skipping any other line; None when none comes in time.
def answer_to(id, answers, deadline):
    while True:
        try:
            line = answers.get(timeout=max(0.01, deadline - time.monotonic()))
        except queue.Empty:
            return None
        if line is None:
            answers.put(None)
            return None
        try:
            answer = json.loads(line)
        except ValueError:
            continue
        if isinstance(answer, dict) and answer.get("id") == id:
            return answer


talk("sdk/server.py", ["--seed", seed], asks)

# What this step adds is printed whole: the answers it is about (by id, None for id null), the logs or the prompt.
# Every other line goes into one line with a fingerprint (a hash), so the print stays short. With --all, every line
# is printed, after a first line that says this print is only to look at.
focus = {4, 6, 9, 11}
every = sys.argv[3:4] == ["--all"]
other = [text for key, text in said if not (every or key in focus or key == "always")]
if every:
    print("all lines, printed with --all: never send this print, send the one without --all")
for key, text in said:
    if every or key in focus or key == "always":
        print(text)
if other:
    digest = hashlib.sha256("\n".join(other).encode()).hexdigest()[:8]
    print(f"{len(other)} more lines (earlier steps' answers and the logs), fingerprint {digest}: to see them, add --all at the end of the check command")
