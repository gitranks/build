# agent: a coding agent, written from nothing, with no library. You chat with it, it asks a model, and the model may
# use tools on the files of this folder. Start it: python3 agent.py on macOS and Linux, py agent.py on Windows.
import json
import os
import subprocess
import sys
import tempfile
import urllib.error
import urllib.request

# Read and write UTF-8 with plain line ends on every system, Windows too.
sys.stdin.reconfigure(encoding="utf-8")
sys.stdout.reconfigure(encoding="utf-8", newline="\n")


# The model server and the model: Ollama on this computer, unless --url and --model say another (see README.md).
def option(name, fallback):
    at = sys.argv.index(name) if name in sys.argv else 0
    return sys.argv[at + 1] if 0 < at < len(sys.argv) - 1 and sys.argv[at + 1] else fallback


SERVER = option("--url", "http://127.0.0.1:11434/v1")
MODEL = option("--model", "qwen2.5:3b")
ROOT = os.getcwd()  # the folder the agent works in: the one you start it in

# The commands you can type, as /help shows them.
HELP = "\n".join([
    "/help    this list",
    "/reset   forget the conversation and start again",
    "/exit    stop the agent",
])

# What the model reads first, before your messages: who it is and how to work.
SYSTEM = (
    "You are a coding agent. You work in one folder, and every path you use is inside it. "
    "Look with the tools before you answer. Keep your answers short, and say what you changed."
)

# The conversation, as the model server reads and writes it: a list of messages, each a role and a content.
messages = [{"role": "system", "content": SYSTEM}]


# The tools the model may ask for: each one's name, what it does and its arguments, in JSON Schema.
def tool(name, description, properties=None, required=None):
    properties = properties or {}
    parameters = {"type": "object", "properties": properties, "required": list(properties) if required is None else required}
    return {"type": "function", "function": {"name": name, "description": description, "parameters": parameters}}


def text(description):
    return {"type": "string", "description": description}


TOOLS = [
    tool("list_files", "List every file in the folder."),
    tool("read_file", "Read a file.", {"path": text("the file's path")}),
    tool("edit_file", "Change a file: old_text, found once in it, becomes new_text. An empty old_text makes a new file.", {
        "path": text("the file's path"),
        "old_text": text("the text to change"),
        "new_text": text("the text to put in its place"),
    }),
    tool("run_command", "Run a shell command in the folder. The person is asked first.", {
        "command": text("the command"),
        "seconds": {"type": "number", "description": "how long it may run: 10 when left out, 60 at most"},
    }, ["command"]),
]


# Send the model the conversation, and give back its answer.
def ask():
    body = json.dumps({"model": MODEL, "messages": messages, "tools": TOOLS}).encode()
    request = urllib.request.Request(SERVER + "/chat/completions", body, {"Content-Type": "application/json"})
    try:
        response = urllib.request.build_opener(urllib.request.ProxyHandler({})).open(request)
    except urllib.error.HTTPError as error:
        response = error  # a status of 400 or more: a server that failed may say why, as JSON or as plain text
    with response:
        try:
            answer = json.loads(response.read())
        except ValueError:
            answer = None
    answer = answer if isinstance(answer, dict) else {}
    if "choices" not in answer:
        why = answer.get("error")
        why = why.get("message") if isinstance(why, dict) else why
        raise RuntimeError(f"the model server said: {why or f'status {response.getcode()}'}")
    return answer["choices"][0]["message"]


# What to tell you when a message got no answer.
def failed(error):
    if not isinstance(error, urllib.error.URLError):
        return str(error)
    return "no answer from the model server. Is it running? README.md says how to start it."


# One message from you, and the model's answer to it.
def turn(text):
    messages.append({"role": "user", "content": text})
    while True:
        answer = ask()
        calls = answer.get("tool_calls") or []
        if not calls:
            messages.append({"role": "assistant", "content": answer.get("content")})
            print(answer.get("content") or "")
            return
        messages.append({"role": "assistant", "content": answer.get("content"), "tool_calls": calls})
        for call in calls:
            messages.append({"role": "tool", "tool_call_id": call["id"], "content": use(call)})


# Run one tool the model asked for, and give back what to send the model.
def use(call):
    name, given = call["function"]["name"], call["function"]["arguments"]
    print(f"tool: {name} {given}")
    try:
        args = json.loads(given or "{}")
        if not isinstance(args, dict):
            raise ValueError
    except ValueError:
        return "error: the arguments are not JSON"
    if name == "list_files":
        return list_files()
    if name == "read_file":
        return read(args.get("path"))
    if name == "edit_file":
        return edit(args.get("path"), args.get("old_text"), args.get("new_text"))
    if name == "run_command":
        return run(args.get("command"), args.get("seconds"))
    return f"error: there is no tool named {name}"


# Every file in the folder, one path a line, but not git's own files or what tools install.
def list_files():
    found = []
    for folder, folders, files in os.walk(ROOT):
        folders[:] = [name for name in folders if name not in (".git", "node_modules", "__pycache__", ".venv")]
        found += [os.path.relpath(os.path.join(folder, name), ROOT).replace(os.sep, "/") for name in files]
    return "\n".join(sorted(found)) or "(the folder is empty)"


# The full path of a path the model gave, or None when it is outside the folder. A model makes mistakes, and a file
# it reads may hold words that steer it, so the tools never reach past the folder, where git shows all they changed.
# Nor into .git: git runs commands its settings there name, and that would get past the question before a command.
def inside(given):
    full = os.path.abspath(os.path.join(ROOT, given)) if isinstance(given, str) and given else ""
    first = full[len(ROOT) + 1:].split(os.sep)[0].lower()
    return full if full.startswith(ROOT + os.sep) and first != ".git" else None


def outside(given):
    if not isinstance(given, str) or not given:
        return "error: give the file's path"
    return f"error: {given} is outside the folder or in its .git, and the tools work only in the folder"


# Read a file of the folder.
def read(given):
    file = inside(given)
    if not file:
        return outside(given)
    if not os.path.isfile(file):
        return f"error: there is no file {given}"
    with open(file, encoding="utf-8", errors="replace", newline="") as f:
        return f.read()


# Change a file: old_text, found once in it, becomes new_text. An empty old_text makes a new file.
def edit(given, old, now):
    file = inside(given)
    if not file:
        return outside(given)
    if not isinstance(old, str) or not isinstance(now, str):
        return "error: give old_text and new_text"
    if not old:
        if os.path.exists(file):
            return f"error: {given} is there already. To change it, give the text to change"
        os.makedirs(os.path.dirname(file), exist_ok=True)
        with open(file, "w", encoding="utf-8", newline="") as f:
            f.write(now)
        return f"made {given}"
    if not os.path.isfile(file):
        return f"error: there is no file {given}"
    with open(file, encoding="utf-8", errors="replace", newline="") as f:
        was = f.read()
    found = was.count(old)
    if not found:
        return f"error: old_text is not in {given}"
    if found > 1:
        return f"error: old_text is in {given} more than once: give more of the text around it"
    with open(file, "w", encoding="utf-8", newline="") as f:
        f.write(was.replace(old, now, 1))
    return f"changed {given}"


# Run a command in the folder, but only once you say yes: a command can do anything you can.
def run(command, seconds):
    if not isinstance(command, str) or not command.strip():
        return "error: give a command"
    # Control characters are shown as codes, so none of them can hide a part of the command on the screen.
    shown = "".join(f"\\x{ord(c):02x}" if ord(c) < 32 or 127 <= ord(c) < 160 else c for c in command)
    print(f"agent: run this command? {shown} (yes or no)")
    if (line("yes or no> ") or "").strip().lower() not in ("y", "yes"):
        return "The person said no, so the command did not run. Ask them what to do instead."
    # A command that runs too long is stopped. Its output goes to a file: a program it started and left running could
    # hold a pipe open, and the agent would wait for it. On Windows such a program may go on running.
    limit = min(seconds, 60) if type(seconds) in (int, float) and seconds > 0 else 10
    with tempfile.TemporaryFile() as out:
        try:
            done = subprocess.run(command, shell=True, cwd=ROOT, stdin=subprocess.DEVNULL, stdout=out, stderr=out, timeout=limit)
            end = f"exit code {done.returncode}"
        except subprocess.TimeoutExpired:
            end = f"stopped after {limit:g} s: it ran too long"
        out.seek(0)
        return end + "\n" + out.read().decode("utf-8", "replace")


# Read your lines one at a time. The prompt shows only when you type at a terminal, not when a program sends them.
def line(prompt):
    if sys.stdin.isatty():
        print(prompt, end="", flush=True)
    return sys.stdin.readline() or None


print(f"agent: ready, model {MODEL}. Type a message, or /help for the commands.")
while (said := line("you> ")) is not None:
    text = said.strip()
    if text == "/exit":
        break
    if text == "/help":
        print(HELP)
    elif text == "/reset":
        messages = [{"role": "system", "content": SYSTEM}]
        print("agent: the conversation is forgotten")
    elif text:
        try:
            turn(text)
        except Exception as error:
            print("agent: " + failed(error))
