# prompt.py: a small prompt to talk to your server by hand. It starts the server for you.
# Type a method, then its params as JSON if it has any, and press Enter:   tools/list
import json
import subprocess
import sys

server = subprocess.Popen(
    [sys.executable, "server.py", *sys.argv[1:]], stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True, encoding="utf-8"
)


def send(message: str, wait: bool) -> None:
    print("-> " + message, flush=True)
    server.stdin.write(message + "\n")
    server.stdin.flush()
    if wait:
        answer = server.stdout.readline()
        print("<- " + answer.strip() if answer else "(the server stopped)", flush=True)


next_id = 0
for line in sys.stdin:
    method, _, params = line.strip().partition(" ")
    if not method:
        continue
    params = json.loads(params) if params else None
    request = {"jsonrpc": "2.0", "method": method}
    if not method.startswith("notifications/"):  # a notification has no id and gets no answer
        next_id += 1
        request = {"jsonrpc": "2.0", "id": next_id, "method": method}
    if params is not None:
        request["params"] = params
    send(json.dumps(request, separators=(",", ":")), "id" in request)
server.communicate()  # closes the server's input, so it stops, and waits for it
