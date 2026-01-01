# my-server

An MCP server written from nothing, with no library, one step at a time with GitRanks Build.

## Add it to your agent

Put the full path to `server.ts` where it says `/path/to/server.ts` (on Windows, with / between folders).

- Claude Code: `claude mcp add my-server -- node /path/to/server.ts`
- Codex: `codex mcp add my-server -- node /path/to/server.ts`
- Gemini CLI: `gemini mcp add my-server node /path/to/server.ts`
- Cursor: write this into `.cursor/mcp.json` in this folder:
  `{"mcpServers": {"my-server": {"type": "stdio", "command": "node", "args": ["/path/to/server.ts"]}}}`
- VS Code: write this into `.vscode/mcp.json` in this folder:
  `{"servers": {"my-server": {"type": "stdio", "command": "node", "args": ["/path/to/server.ts"]}}}`

## After you change the code, start it again

- Claude Code: type `/mcp`, pick my-server, then Reconnect.
- Gemini CLI: type `/mcp reload`.
- VS Code: run MCP: List Servers, pick my-server, then Restart Server.
- Codex and Cursor: restart the agent.

## Talk to it yourself

Run `node prompt.ts`, then type a method and its params, if it has any: `ping`, `tools/list`. Ctrl+C stops it.
