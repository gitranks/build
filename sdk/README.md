# my-server on the official SDK

The same my-server, rebuilt on the official MCP SDK for Python, the `mcp` package. It runs on the packages in
`packages` here, which `<python> .gitranks/setup.py` installs at the exact version `requirements.txt` names.

## Add it to your agent, beside your own

It goes in as `my-server-sdk`, so your agent has both servers. In each line below, `<python>` is the command your
check runs with: `python3` on macOS and Linux, `python` or `py` on Windows (there `python3` may open the Microsoft
Store). `<path>` is the full path to `sdk/server.py` with / between folders, like `/home/you/build/sdk/server.py`
or `C:/Users/you/build/sdk/server.py` (a `\` breaks the JSON lines). To print the build's folder: `pwd` on macOS,
Linux and in PowerShell (write its `\` as `/`), `cd` in cmd, `pwd -W` in Git Bash.

- Claude Code: `claude mcp add my-server-sdk -- <python> <path>`
- Codex: `codex mcp add my-server-sdk -- <python> <path>`
- Gemini CLI: `gemini mcp add my-server-sdk <python> <path>`
- Cursor, in `.cursor/mcp.json`, beside my-server: `"my-server-sdk": {"type": "stdio", "command": "<python>", "args": ["<path>"]}`
- VS Code, in `.vscode/mcp.json`, beside my-server: `"my-server-sdk": {"type": "stdio", "command": "<python>", "args": ["<path>"]}`

After a change to the code, start it again as the README beside `server.py` says, with `my-server-sdk` for its
name.

## Take it away

Remove it from your agent (`claude mcp remove my-server-sdk`, `codex mcp remove my-server-sdk`, `gemini mcp remove
my-server-sdk`, or its lines in the JSON file), then delete this folder, `sdk`: the packages go with it, since
nothing was installed anywhere else. pip keeps a copy of each download in its cache; `<python> -m pip cache purge`
empties it.
