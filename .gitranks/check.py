# The quiet check of a step: it starts the agent a few times, in a folder of its own, with messages made from the
# seed. A stand-in answers in the model's place, from a script, so no model is needed. The check prints what the
# agent said. It decides nothing: GitRanks compares the print with what it expects.
import hashlib
import http.server
import json
import os
import re
import shutil
import socket
import socketserver
import subprocess
import sys
import tempfile
import threading
import time

sys.stdout.reconfigure(encoding="utf-8", newline="\n")
step = sys.argv[1] if len(sys.argv) > 1 else ""
n = 1
for ch in sys.argv[2] if len(sys.argv) > 2 else "1":
    n = (n * 31 + ord(ch)) % 2147483647


def pick(options):
    global n
    n = (n * 48271) % 2147483647 or 1
    return options[n % len(options)]


said = []  # each line to print, with the step it is about, or "always"
AGENT = os.path.abspath("agent.py")
top = tempfile.mkdtemp(prefix="agent-check-")
folder = os.path.join(top, "work")  # the folder the agent works in
os.mkdir(folder)

# The stand-in for the model: a small server on this computer, on a free port, that answers each request with the
# next answer of the session's script. It knows one model, "stand-in", as a model server knows the models it has.
script = []
asks = 0


class StandIn(http.server.BaseHTTPRequestHandler):
    def do_POST(self):
        global asks
        try:
            ask = json.loads(self.rfile.read(int(self.headers.get("Content-Length") or 0)))
        except ValueError:
            ask = None
        status = 404
        if self.path != "/v1/chat/completions" or not isinstance(ask, dict) or not isinstance(ask.get("messages"), list):
            answer = {"error": {"message": "the stand-in answers only a chat sent to /v1/chat/completions"}}
        elif ask.get("model") != "stand-in":
            answer = {"error": {"message": f'model "{ask.get("model")}" not found, try pulling it first'}}
        else:
            status = 200
            asks += 1
            reply = (script.pop(0) if script else lambda ask: "(the stand-in has nothing more to say)")(ask)
            if isinstance(reply, str):
                message = {"role": "assistant", "content": reply}
            else:
                calls = [{"id": f"call_{asks}_{i}", "type": "function", "function": {"name": name, "arguments": args}} for i, (name, args) in enumerate(reply)]
                message = {"role": "assistant", "content": "", "tool_calls": calls}
            answer = {"choices": [{"index": 0, "message": message, "finish_reason": "stop" if isinstance(reply, str) else "tool_calls"}]}
        data = json.dumps(answer).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def log_message(self, *args):
        pass


# A plain server: http.server's own looks its address up by name first, which takes half a minute on some computers.
server = socketserver.ThreadingTCPServer(("127.0.0.1", 0), StandIn)
server.daemon_threads = True
threading.Thread(target=server.serve_forever, daemon=True).start()
url = f"http://127.0.0.1:{server.server_address[1]}/v1"


# The stand-in's answers. Some say what it got, so the print shows what the agent sent the model.
def one_line(text):
    line = " | ".join(str("" if text is None else text).replace("\r", "").strip().split("\n"))
    return line[:90] + "..." if len(line) > 90 else line


def heard(ask):
    last = ask["messages"][-1] if ask["messages"] else {}
    source = f"tool {last.get('tool_call_id')}" if last.get("role") == "tool" else last.get("role")
    return f"I got messages: {len(ask['messages'])}. The last, from {source}, says: {one_line(last.get('content'))}"


def to_json(value):
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def call(name, args=None):
    return lambda ask: [(name, to_json(args or {}))]


# A command for the agent to run: this runtime, as it is named on this computer. The print names it python.
RUNTIME = f'"{sys.executable}"'


def command(code):
    return f'{RUNTIME} -c "{code}"'


# Start the agent once, send it these lines, and keep what it printed. All the sessions together get 20 seconds at
# most, and an agent that does not stop ends the check there: the next sessions would wait for it too.
deadline = time.monotonic() + 20
stopped = False


def clean(text):
    # The runtime's path and the stand-in's address differ on each computer, so the print names neither.
    for this, that in ((to_json(RUNTIME)[1:-1], "python"), (RUNTIME, "python"), (url, "the stand-in")):
        text = text.replace(this, that)
    return text


def session(about, lines, replies=(), url_given=None, model="stand-in"):
    global stopped, script, asks
    if stopped:
        return
    timeout = min(5, deadline - time.monotonic())
    if timeout < 0.5:
        stopped = True
        said.append(("always", "the check ran out of time: the agent took too long to answer"))
        return
    said.append((about, "sent: " + (" | ".join(lines) or "nothing")))
    script = list(replies)
    asks = 0
    sent = "".join(line + "\n" for line in lines).encode()
    env = {**os.environ, "PYTHONIOENCODING": "utf-8"}
    args = [sys.executable, AGENT, "--url", url_given or url, "--model", model]
    # Files, not pipes: a program the agent started and left running can not keep the check waiting.
    with tempfile.TemporaryFile() as out, tempfile.TemporaryFile() as err:
        try:
            code = subprocess.run(args, input=sent, stdout=out, stderr=err, timeout=timeout, env=env, cwd=folder).returncode
        except subprocess.TimeoutExpired:
            code = None
        out.seek(0)
        err.seek(0)
        stdout, stderr = out.read().decode("utf-8", "replace"), err.read().decode("utf-8", "replace")
    for line in clean(stdout).splitlines():
        if line.strip():
            said.append((about, line.rstrip()))
    # A crash's line, with each path in it cut to its file's name.
    crash = [line for line in stderr.splitlines() if line[:1].isalpha() and "Error" in line.split(":")[0]]
    if crash:
        said.append(("always", "the agent crashed: " + re.sub(r"""(['"])[^'"]*[\\/]([^\\/'"]*)\1""", r"\1\2\1", clean(crash[-1].strip()))))
    if code is None:
        stopped = True
        said.append(("always", "the agent did not stop when its input ended, so the check stopped there"))
    elif code != 0:
        said.append(("always", f"the agent stopped with code {code}"))


session("what-you-will-build", [])
session("read-messages", ["/help", "", pick(["hello", "hi there", "good morning"]), "/exit", "/help"])
question = pick(["what is 6 times 7?", "what is the capital of France?", "is water wet?"])
session("ask-the-model", [pick(["hello", "hi there", "good morning"]), question], [heard, heard])
# A free port with nothing on it: no model server answers there.
with socket.socket() as spare:
    spare.bind(("127.0.0.1", 0))
    nowhere = f"http://127.0.0.1:{spare.getsockname()[1]}/v1"
session("when-the-model-fails", ["are you there?"], [], url_given=nowhere)
session("when-the-model-fails", ["hello"], [heard], model=pick(["llama9", "qwen-huge", "gpt-local"]))


def told(ask):
    return f"I got messages: {len(ask['messages'])}. You told me: " + " / ".join(m["content"] for m in ask["messages"] if m.get("role") == "user")


name = pick(["Ada", "Grace", "Linus", "Margaret"])
session("remember-the-conversation", [f"my name is {name}", "what is my name?", "/reset", "what is my name?"], [told, told, told])


def first(ask):
    m = ask["messages"][0] if ask["messages"] else {}
    return f"I got messages: {len(ask['messages'])}. The first, from {m.get('role')}, says: {one_line(m.get('content'))}"


who = pick(["who are you?", "what do you do?", "where do you work?"])
session("a-system-prompt", [who, "/reset", who], [first, first])


def offered(ask):
    return "I can use: " + (", ".join(str(t.get("function", {}).get("name")) for t in ask.get("tools") or []) or "no tools")


session("offer-a-tool", ["which tools do you have?", "what files are here?"], [offered, call("list_files")])
# The folder's own files.
note, word, changed = pick([("remember the milk", "milk", "bread"), ("water the plants", "plants", "cactus"), ("call the bank", "bank", "school")])
with open(os.path.join(folder, "notes.txt"), "wb") as f:
    f.write(f"todo: {note}\n".encode())
os.mkdir(os.path.join(folder, "src"))
with open(os.path.join(folder, "src", pick(["hello.js", "main.py", "app.ts"])), "wb") as f:
    f.write(b"print('hello')\n")
other = pick(["delete_all", "search_web", "open_browser"])
session("the-agent-loop", ["what files are here?", "use another tool"], [call("list_files"), heard, call(other), heard])
missing = pick(["todo.txt", "plan.md", "list.txt"])
reads = [call("read_file", {"path": "notes.txt"}), heard, call("read_file", {"path": missing}), heard, lambda ask: [("read_file", '{"path": notes.txt}')], heard]
session("read-a-file", ["what is in my notes?", f"read {missing}", "read it in a broken way"], reads)
# A file next to the folder, outside it.
with open(os.path.join(top, "secret.txt"), "wb") as f:
    f.write(("the secret is " + pick(["owl", "kite", "moon"]) + "\n").encode())
away = pick(["/secret.txt", "src/../../secret.txt"])
in_git = [call("read_file", {"path": away}), heard, call("read_file", {"path": pick([".git/config", ".GIT/hooks/pre-commit"])}), heard]
session("stay-in-the-folder", ["read the secret", "read it another way", "read git's settings"], [call("read_file", {"path": "../secret.txt"}), heard, *in_git])
edits = [call("edit_file", {"path": "notes.txt", "old_text": word, "new_text": changed}), call("read_file", {"path": "notes.txt"}), heard]
edits += [call("edit_file", {"path": "notes.txt", "old_text": pick(["nothing like this", "zebra"]), "new_text": "x"}), heard]
edits += [call("edit_file", {"path": "../secret.txt", "old_text": "the", "new_text": "a"}), heard]
session("edit-a-file", [f"change {word} to {changed}", "change something that is not there", "change the secret"], edits)
made = pick(["plans/next.txt", "docs/ideas.md", "todo/today.txt"])
makes = [call("edit_file", {"path": made, "old_text": "", "new_text": "run a command\n"}), call("list_files"), heard]
makes += [call("edit_file", {"path": made, "old_text": "", "new_text": "again\n"}), heard]
session("make-a-file", [f"make {made}", "make it again"], makes)
server.shutdown()
shutil.rmtree(top, ignore_errors=True)

# What this step adds is printed whole. Every other line goes into one line with a fingerprint (a hash), so the
# print stays short. With --all, every line is printed, after a first line that says this print is only to look at.
every = sys.argv[3:4] == ["--all"]
shown = [text for about, text in said if every or about in ("always", step)]
rest = [text for about, text in said if not (every or about in ("always", step))]
if every:
    print("all lines, printed with --all: never send this print, send the one without --all")
for text in shown:
    print(text)
if rest:
    digest = hashlib.sha256("\n".join(rest).encode()).hexdigest()[:8]
    print(f"{len(rest)} more lines (earlier steps' answers and the logs), fingerprint {digest}: to see them, add --all at the end of the check command")
