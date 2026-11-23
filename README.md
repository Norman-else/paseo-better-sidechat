# paseo-better-sidechat

A **Universal AI Sidechat** plugin for [Paseo](https://paseo.sh) (`>= 0.16.0`). Ask side questions, cross-check architecture decisions with a second model, inspect logs/MCP data, or unpack errors in Paseo's right-hand panel—without interrupting a running main agent turn or polluting your primary conversation context.

Built to feel 100% native to Paseo: pixel-aligned composer geometry, universal multi-provider support, `@files` / `/commands` / `/skills` autocomplete, native `+` attachments, live Paseo settings sync, and automatic hosting of third-party Paseo timeline rendering plugins (such as `Gen-UI`).

---

## Features

### 1. Universal Multi-Provider & Full MCP Tool Support
- **All Paseo Providers**: Automatically discovers every enabled built-in and custom ACP/plugin provider on the host (`Claude`, `Codex`, `GitHub Copilot`, `OpenCode`, `Kimi`, `Antigravity`, `MiniMax`, `Cursor`, and custom ACP providers).
- **Smart Defaults, Instant Switching**: Inherits your active main session's provider, model, thinking effort, permission mode, and configured MCP servers by default—or lets you switch to another provider/model directly from the sidechat toolbar to get a second opinion.
- **Provider-Native Controls**: Renders official provider icons, provider-specific permission modes, thinking effort levels, and dynamic option controls (such as Claude `⚡` Fast Mode).

### 2. Native Paseo Composer Experience
- **1:1 Paseo Composer Layout**: Matches Paseo's `ComposerDock` and `MessageInput` geometry (`116px` resting desktop card, dynamic multiline auto-expand, toolbar overhang alignment, `borderAccent` styling, and `contentMaxWidth`).
- **Native `+` Attachment Menu**:
  - **Add image** (file picker + direct clipboard image paste)
  - **Add issue or PR / MR** (auto-detects GitHub, GitLab, Gitea, Forgejo, and Codeberg repositories with live search)
  - **Plugin Attachment Sources** (automatically loads installed Paseo attachment plugins, e.g., `Attach Jira ticket` from `paseo-jira`)
  - **Upload file**
- **`@files`, `/commands`, and `/skills` Autocomplete**:
  - Fuzzy workspace file & directory tagging via `@`
  - Provider slash commands at prompt start (`/`) and inline `/skills` anywhere in your message
  - Built-in client commands: `/new`, `/clear`, `/archive`, and `/exit`
- **Context Window & Quota Popover**: Click the circular context usage ring to inspect token usage, session cost, provider rate-limit bars, and reset countdowns.

### 3. Automatic Hosting of Paseo Timeline Plugins
- **Zero Hardcoded Renderers**: Dynamically discovers and evaluates `addTimelineTransformer` and `addTimelineRenderer` contributions from any other plugin installed on the active Paseo host (for example, rendering `Card`, `Diagram`, `Table`, and `Callout` blocks via `Gen-UI`, as well as any rendering plugins you install in the future).
- **Streaming & Error Isolation**: Supports both `streaming` and `complete` transformation phases, forwards plugin-scoped `useRpc` / `useSettings` / `useTranslation` calls to their owning plugin, and wraps third-party renderers in an `ErrorBoundary` with automatic Markdown fallback.

### 4. Main Session Context, Cross-Pane Quote & Handoff
- **Dynamic Follow-Up Starter Suggestions**: Opening a new sidechat thread automatically generates 4 contextual follow-up questions in the main conversation's language—instantly surfacing open design dilemmas, remaining tasks, touched files/tickets, and AI-tailored follow-ups with one-click refresh (running in an isolated empty temp directory with MCP disabled, falling back to instant local extraction only when set to `off` or when AI generation is unavailable).
- **Main Session Context Digest**: Optionally attaches a concise digest of recent main-session turns and touched files on the first turn of a new sidechat (with a full preview modal and one-click toggle).
- **Cross-Pane Quote Selection**: Highlighting code or logs in the main chat or diff view surfaces a `+ Quote selection` pill above the sidechat composer for one-click quoting.
- **One-Click Handoff Back to Main**: Every completed sidechat response includes `Copy`, `Insert to main` (inserts into the main composer), and `Send to main` (sends directly to the main agent), plus `Open as main tab` from the thread switcher.

### 5. Fast Entry Points
- **Composer Pill**: Click `Sidechat` right above the main chat composer.
- **Slash Commands**: Run `/btw [question]` or `/sidechat [question]` directly in the main chat composer to open Sidechat (and immediately submit `[question]` if provided) without sending anything to the main thread.
- **Command Center**: Search `Sidechat` or `btw` (`Open Sidechat`, `New Sidechat`, `Workspace Sidechat`).

### 6. Live Paseo Settings & 9-Language i18n
- **Real-Time Settings Sync**: Automatically tracks Paseo's active theme (dark, light, and custom plugin themes), UI & monospace fonts/sizes, `autoExpandReasoning`, `chatDisplay` (`collapseTurns`, `collapseToolCalls`, `full`), `chatOutlineEnabled`, `sendShortcut` (`Enter` vs `Cmd/Ctrl+Enter`), and `sendBehavior` (`steer` vs `interrupt`).
- **9 Built-in Languages**: Full localization for `en`, `zh-CN`, `ja`, `ko`, `es`, `fr`, `pt-BR`, `ru`, and `ar`.

---

## Requirements

- **Paseo** `>= 0.16.0`
- Enable plugins in Paseo: **Settings → Plugins → Enable plugins**

---

## Installation & Updating

`paseo-better-sidechat` has zero external runtime dependencies beyond Paseo's built-in plugin host modules, so it installs cleanly on both local machines and headless Linux VPS hosts without requiring `npm install`.

### Install from GitHub

```bash
paseo plugin add git:Norman-else/paseo-better-sidechat
```

### Update an Existing Installation

> Note: Pass the installed plugin ID (`paseo-better-sidechat`), not the `git:...` URL.

```bash
paseo plugin update paseo-better-sidechat --yes
```

### Target a Remote Paseo Daemon (Optional)

If you run Paseo against a remote SSH/TCP daemon, run the commands above on that host directly or pass `--host <endpoint>`:

```bash
paseo plugin --host <host:port> add git:Norman-else/paseo-better-sidechat
paseo plugin --host <host:port> update paseo-better-sidechat --yes
```

---

## Configuration

Open **Settings → Plugins → Better Sidechat** inside Paseo to customize:

- **Main context mode**: `Auto on first message` (default), `Always attach`, or `Manual only`
- **Recent main turns to summarize**: `2` – `12` turns (default `6`)
- **Default permission mode**: `Inherit main session` (default), `Read-only / Plan`, or `Auto / Default`
- **Inherit main session model**: Automatically match the main agent's provider and model (default `true`)
- **Show Sidechat button in main composer**: Toggle the `Sidechat` shortcut pill above the main composer

---

## Local Development

```bash
# Install dev dependencies for local typechecking and unit tests
npm install

# Run TypeScript typecheck and test suite
npm run typecheck
npm test

# Install local checkout into your local Paseo daemon
paseo plugin install .

# Inspect plugin status and logs
paseo plugin ls paseo-better-sidechat
paseo plugin logs paseo-better-sidechat

# Hot-reload after making changes (no daemon restart required)
paseo plugin reload paseo-better-sidechat
```

---

## License

MIT
