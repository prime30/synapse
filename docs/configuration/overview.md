# Configuration

Customize Synapse to match your workflow.

## Settings

Open settings via the gear icon in the activity bar or `Ctrl+,`.

![Settings modal showing editor preferences](./images/config-settings.png)

### Editor Tab

| Setting | Default | Description |
|---------|---------|-------------|
| Font size | 14px | Editor font size |
| Tab size | 2 | Spaces per tab |
| Word wrap | On | Wrap long lines |
| Minimap | On | Show code minimap |
| Line numbers | On | Show line numbers |
| Auto-save | 2s delay | Auto-save after changes |

### Appearance Tab

| Setting | Default | Description |
|---------|---------|-------------|
| Chromatic theming | On | Tint IDE with theme colors |
| Intensity | 40% | Chromatic theming intensity |
| Transition duration | 1200ms | Color transition speed |
| Sidebar tinting | On | Apply chromatic to sidebar |
| Editor tinting | On | Apply chromatic to editor |
| Preview tinting | Off | Apply chromatic to preview |

![Appearance settings with chromatic controls](./images/config-appearance.png)

### Keys Tab

Customize keyboard shortcuts. Click any shortcut to record a new key combination.

![Keyboard shortcut editor](./images/config-keybindings.png)

## Keyboard Shortcuts

### General

| Shortcut | Action |
|----------|--------|
| `Ctrl+P` | Open command palette (files) |
| `Ctrl+Shift+P` | Open command palette (commands) |
| `Ctrl+,` | Open settings |
| `Ctrl+L` | Toggle AI sidebar |
| `` `Ctrl+` `` | Toggle theme console |
| `Ctrl+S` | Save current file |
| `Ctrl+W` | Close current tab |

### Editor

| Shortcut | Action |
|----------|--------|
| `Ctrl+D` | Select next occurrence |
| `Ctrl+Z` | Undo |
| `Ctrl+Shift+Z` | Redo |
| `Ctrl+/` | Toggle comment |
| `Ctrl+Shift+F` | Format document |
| `Ctrl+Click` | Go to definition |
| `F12` | Go to definition |

### AI

| Shortcut | Action |
|----------|--------|
| `Ctrl+L` | Open AI sidebar |
| `Enter` | Send message |
| `Shift+Enter` | New line in message |
| `Escape` | Stop AI generation |
| `Tab` / `1-5` | Navigate suggestion chips |

## Theme Console

Toggle with `` `Ctrl+` `` to see:

- **Diagnostics** — Real-time Liquid, CSS, and JSON errors
- **Push logs** — Shopify push activity and results
- **Theme check** — Shopify Theme Check results

![Theme console showing diagnostics and push logs](./images/config-console.png)

## Offline Mode

When your connection drops:

- Changes are saved locally and queued for push
- The status bar shows "Offline — changes saved locally"
- On reconnect, queued changes push automatically

![Offline indicator in the status bar](./images/config-offline.png)
