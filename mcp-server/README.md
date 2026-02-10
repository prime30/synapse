# Synapse MCP Server

MCP (Model Context Protocol) server for Synapse, exposing project, file, agent, and preference tools to Cursor and other MCP clients.

## Prerequisites

- Node.js 18+
- Synapse app running (for API base URL)

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Build:

   ```bash
   npm run build
   ```

   Output is in `dist/`. Run with:

   ```bash
   node dist/index.js
   ```

3. Configure environment (optional):

   - `SYNAPSE_API_BASE` – Synapse API base URL (default: `http://localhost:3000`)
   - `SYNAPSE_AUTH_TOKEN` – Auth token for API calls (set after logging in via MCP auth tools)
   - `LOG_LEVEL` – `debug` | `info` | `warn` | `error` (default: `info`)

## Cursor MCP configuration

Add the server to Cursor’s MCP settings (e.g. **Settings → MCP** or `.cursor/mcp.json`). Use the sample in `cursor-config.json`:

- **Command:** `node`
- **Args:** `dist/index.js` (run from the `mcp-server` directory) or use an absolute path to `dist/index.js`
- **Env:** Optionally set `SYNAPSE_API_BASE` and, after auth, `SYNAPSE_AUTH_TOKEN`

Example (run from repo root, with `mcp-server` as working directory):

```json
{
  "mcpServers": {
    "synapse": {
      "command": "node",
      "args": ["mcp-server/dist/index.js"],
      "cwd": "<path-to-repo>/mcp-server",
      "env": {
        "SYNAPSE_API_BASE": "http://localhost:3000"
      }
    }
  }
}
```

If you run from inside `mcp-server`:

```json
{
  "mcpServers": {
    "synapse": {
      "command": "node",
      "args": ["dist/index.js"],
      "cwd": "<path-to-repo>/mcp-server",
      "env": {}
    }
  }
}
```

## Tools

- **Auth:** authenticate, get_token_status, logout
- **Projects:** list_projects, get_project
- **Files:** list_files, read_file, write_file, create_file, delete_file
- **Agents:** execute_agents
- **Apply changes:** apply_changes
- **Preferences:** get_preferences, set_preference

## Tests

```bash
npm test
```

## License

Same as the Synapse project.
