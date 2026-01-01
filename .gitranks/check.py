# The quiet check of a step: it starts your server, sends it messages made from the seed and
# prints what came back. It decides nothing: GitRanks compares the print with what it expects.
import json
import subprocess
import sys
import tempfile

n = 1
for ch in sys.argv[2] if len(sys.argv) > 2 else "1":
    n = (n * 31 + ord(ch)) % 2147483647
seed = str(n)
lines = []


def pick(options):
    global n
    n = (n * 48271) % 2147483647 or 1
    return options[n % len(options)]


def call(id, method, params=None):
    message = {"jsonrpc": "2.0", "id": id, "method": method}
    if params is not None:
        message["params"] = params
    return json.dumps(message, separators=(",", ":"))


lines += [call(1, pick(["hello", "say/hi", "what/now", "roll/please"])), "this line is not JSON"]
lines += [json.dumps({"jsonrpc": "2.0", "method": pick(["notifications/hello", "notifications/ready"])})]
version = pick(["2025-11-25", "2025-06-18", "2024-11-05"])
lines += [call(2, "initialize", {"protocolVersion": version, "capabilities": {}, "clientInfo": {"name": "check", "version": "1"}})]
lines += [call("odd", pick(["initialize", "ping", "tools/list"]), pick(["oops", [1, 2], 7]))]
lines += [call(3, "ping")]
lines += [call(4, "tools/list")]
lines += [call(5, "tools/call", {"name": "roll_dice", "arguments": {"sides": pick([6, 8, 12, 20, None])}})]
lines += [call(6, "tools/call", {"name": pick(["fly", "roll_die", "dice"]), "arguments": {}})]


def show(name, file, args, sent):
    data = "".join(line + "\n" for line in sent).encode()
    # Files, not pipes: a program left running can not keep the check waiting.
    with tempfile.TemporaryFile() as out, tempfile.TemporaryFile() as err:
        try:
            code = subprocess.run([sys.executable, file, *args], input=data, stdout=out, stderr=err, timeout=5).returncode
        except subprocess.TimeoutExpired:
            code = None
        out.seek(0)
        err.seek(0)
        stdout, stderr = out.read().decode("utf-8", "replace"), err.read().decode("utf-8", "replace")
    for line in stdout.splitlines():
        if line.strip():
            print(f"{name} said: {line.strip()}")
    for line in stderr.splitlines():
        if line.startswith("my-server: "):
            print(f"{name} logged: {line[11:].strip()}")
    crash = [line for line in stderr.splitlines() if line[:1].isalpha() and "Error" in line.split(":")[0]]
    if crash:
        print(f"{name} crashed: {crash[-1].strip()}")
    if code is None:
        print(f"{name} did not stop within 5 seconds")
    elif code != 0:
        print(f"{name} stopped with code {code}")


show("server", "server.py", ["--seed", seed], lines)
show("prompt", "prompt.py", [], [pick(["tools/list", "ping", "hello/again"])])
