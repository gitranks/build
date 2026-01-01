# my-server

An MCP server written from nothing, with no library, one step at a time with GitRanks Build.

## Add it to your agent

In each line below, `<path>` is the full path to `server.ts` with / between folders, like `/home/you/build/server.ts`
or `C:/Users/you/build/server.ts` (a `\` breaks the JSON lines). To print this folder: `pwd` on macOS, Linux and in
PowerShell (write its `\` as `/`), `cd` in cmd, `pwd -W` in Git Bash. Node on Windows cannot open Git Bash's `/c/...`.

- Claude Code: `claude mcp add my-server -- node <path>`
- Codex: `codex mcp add my-server -- node <path>`
- Gemini CLI: `gemini mcp add my-server node <path>`
- Cursor, in `.cursor/mcp.json` in this folder: `{"mcpServers": {"my-server": {"type": "stdio", "command": "node", "args": ["<path>"]}}}`
- VS Code, in `.vscode/mcp.json` in this folder: `{"servers": {"my-server": {"type": "stdio", "command": "node", "args": ["<path>"]}}}`

## After you change the code, start it again

- Claude Code: type `/mcp`, pick my-server, then Reconnect.
- Gemini CLI: type `/mcp reload`.
- VS Code: run MCP: List Servers, pick my-server, then Restart Server.
- Codex and Cursor: restart the agent.

## Talk to it yourself

Run `node prompt.ts`, then type a method and its params, if it has any: `ping`, `tools/list`. Ctrl+C stops it.
