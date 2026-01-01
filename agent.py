# agent: a coding agent, written from nothing, with no library. You chat with it, it asks a model, and the model may
# use tools on the files of this folder. Start it: python3 agent.py on macOS and Linux, py agent.py on Windows.
import json
import sys
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

# The commands you can type, as /help shows them.
HELP = "\n".join([
    "/help    this list",
    "/exit    stop the agent",
])

messages = []  # the conversation, as the model server reads and writes it: messages, each a role and a content


# Send the model the conversation, and give back its answer.
def ask():
    body = json.dumps({"model": MODEL, "messages": messages}).encode()
    request = urllib.request.Request(SERVER + "/chat/completions", body, {"Content-Type": "application/json"})
    with urllib.request.build_opener(urllib.request.ProxyHandler({})).open(request) as response:
        return json.load(response)["choices"][0]["message"]


# One message from you, and the model's answer to it.
def turn(text):
    messages[:] = [{"role": "user", "content": text}]
    answer = ask()
    print(answer.get("content") or "")


# Read your lines one at a time. The prompt shows only when you type at a terminal, not when a program sends them.
def line(prompt):
    if sys.stdin.isatty():
        print(prompt, end="", flush=True)
    return sys.stdin.readline() or None


print("agent: ready. Type a message, or /help for the commands.")
while (said := line("you> ")) is not None:
    text = said.strip()
    if text == "/exit":
        break
    if text == "/help":
        print(HELP)
    elif text:
        turn(text)
