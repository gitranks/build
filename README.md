# agent

A coding agent written from nothing, with no library, one step at a time with GitRanks Build. Start it in this
folder with `python3 agent.py` on macOS and Linux, or `python agent.py` or `py agent.py` on Windows, then type a
message and press Enter. Its tools work only inside the folder you start it in.

## The model

It asks a free model on your own computer: Qwen 2.5 3B, served by Ollama.

1. Get Ollama from https://ollama.com/download. macOS 14 or later: open Ollama.dmg, move Ollama to Applications
   and open it. Windows 10 22H2 or later: run OllamaSetup.exe. Linux: `curl -fsSL https://ollama.com/install.sh | sh`
2. In a terminal: `ollama pull qwen2.5:3b`, then try it with `ollama run qwen2.5:3b "Say hello"`.

The model takes 1.9 GB of disk and about 3 GB of memory while it answers, so 8 GB of memory is enough. Ollama itself
takes up to 4 GB of disk. While it runs, it answers at http://127.0.0.1:11434: if the agent gets no answer, open
the Ollama app, or run `ollama serve` in a terminal of its own. `--model` picks another model, and `--url` another
server that speaks the OpenAI chat API, such as LM Studio's: `--url http://127.0.0.1:1234/v1`.
