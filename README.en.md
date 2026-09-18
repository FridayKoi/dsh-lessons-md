# dsh-lessons-md

[中文](README.md) | [English](README.en.md)

**DeepSeek Harness (DSH) Web UI plugin for your [LESSONS.md](https://github.com/FridayKoi/lessons-md) mistake notebook** — browse, search and manage the notebook of your current workspace right in the DSH sidebar, with level-colored entries (🔴 Ban / 🟡 Advice) and recurrence counts.

> An AI that remembers its own mistakes — so it stops repeating them.

## Features

- 📓 **Sidebar panel**: a notebook entry appears in the DSH Web UI sidebar, one click away
- 🔴🟡 **Level-colored rendering**: Ban (red) / Advice (amber), recurrence count at a glance
- ✏️ **Panel-side management**: add, edit and delete entries from the panel (two-step delete confirmation)
- 🔍 **Live search**: full-text filter across titles, scenes, wrong/right approaches and sources
- 🏷️ **Level filter & sorting**: counter chips (all / ban / advice) + sort by id, recurrences or bans
- 🔄 **Live refresh**: external edits to `LESSONS.md` appear within seconds (file-change stream + poll fallback)
- 🤖 **Agent tools**: three model-invocable tools so the DSH agent maintains its own notebook
- 🌐 **Bilingual**: every UI string follows the DSH language setting (中文 / English), no reload needed

### Agent tools

| Tool | What it does |
|------|--------------|
| `notebook_read` | Read the full workspace notebook — the agent consults it before starting a task to avoid known pitfalls |
| `notebook_write` | Append a new entry (title / scene / wrong / right / source / level, optional family link) |
| `notebook_hit` | Mark a recurrence: counter +1 with date, **auto-escalates to 🔴 Ban at 3** |

Together they close the loop: the agent gets corrected → `notebook_write` records it → next session `notebook_read` avoids it → a repeat triggers `notebook_hit` → chronic offenders auto-escalate to Ban. You watch the whole picture in the panel.

## Wiring with AGENTS.md (recommended combo)

DSH reads the project-root `AGENTS.md` natively, **zero config**. The two are complementary:

- `AGENTS.md` makes the agent *read the notebook every session* (habit layer)
- This plugin provides *visualization + agent tools + panel management* (tool layer)

Paste this block into your project-root `AGENTS.md`:

```markdown
## Mistake Notebook (LESSONS.md)
- Before starting any task, check whether LESSONS.md exists in the project root: if it does, read all entries and reply one line "Notebook read (N entries)" as confirmation (no such line = not read); if not, skip this section
- When an operation matches any entry's trigger scene, re-read that entry first; 🔴 Ban entries are unconditional — stop and explain before violating one
- After finishing a session or a milestone, proactively ask the user whether to run a retro
- Distilled pitfalls go into the project-root LESSONS.md only (its entry format, with recurrence dates); do not write them into auto-memory or other files
```

> Full cross-tool install guide (three tiers: passive / semi-auto / full-auto) lives in the upstream repo [FridayKoi/lessons-md](https://github.com/FridayKoi/lessons-md), `docs/INSTALL.md`.

## Entry format

This plugin parses and renders the following fields of `LESSONS.md`:

- **Title**: `## [E-XXX] imperative sentence` (one line saying what to do)
- **Trigger scene**: when this entry should come to mind
- **❌ Wrong** / **✅ Right**
- **Recurred**: `N times (MM-DD, ...)` — counter with date trail
- **Level**: 🟡 Advice / 🔴 Ban
- **Source**: which task/tool it came from

Two advanced fields (also parsed and rendered):

- `- 同族: E-XXX` (family): same root cause, different fix; when one is matched, read the whole family
- `- 升级: YYYY-MM-DD 3rd recurrence, upgraded to Ban`: escalation trail

**Human edits win**: deleting/editing via the panel IS a human edit and is respected by the recording rules.

## Install (planned)

The plugin is not published to npm yet (source-only on GitHub). Once published:

```bash
dsh plugin --profile web add dsh-lessons-md
```

## Local development

Prerequisites: Node.js ≥ 24; DSH has run once on this machine (`npx @deepseek-ai/dsh web`, which creates `~/.dsh`).

```powershell
# 1. Mount this package into the web profile (simulates dsh plugin add)
New-Item -ItemType Junction -Path "$env:USERPROFILE\.dsh\profiles\node_modules\dsh-lessons-md" -Target "<repo path>"
# 2. Link the official runtime packages (imports resolve, no re-download)
New-Item -ItemType Junction -Path "<repo path>\node_modules\@deepseek-ai" -Target "$env:USERPROFILE\.dsh\profiles\node_modules\@deepseek-ai"
# 3. Launch
dsh web --patch <repo path>/cordis.yml --port 3082
```

Open the printed URL and click the 📓 icon in the sidebar. After editing `src/client.js` a browser refresh is enough (the server versions bundles by content hash — no restart).

> No API key needed: the panel is a pure browser-side implementation that reads workspace files through DSH's `workspaceFiles` remote — zero model calls.

## How it works

```
src/host.js    Host entry: makes the DSH loader discover and mount this package;
               registers the agent tools and the /lessons-* commands
src/client.js  Client entry: hand-written lazy CJS bundle (ModuleLoader contract)
               ├─ slots.inject('sidebar.panellist') → sidebar icon
               ├─ slots.inject('main')              → global panel body
               ├─ ctx.remote.workspaceFiles.readAll → reads LESSONS.md
               └─ ctx.remote.commands.execute       → panel edits via host commands
```

- **Parsing**: entries follow the lessons-md format (`## [E-XXX] title`, scene/wrong/right/recurrence/level/source, family & escalation); falls back to a friendly hint when nothing parses
- **Panel editing**: goes through DSH's commands mechanism (`/lessons-add` `/lessons-edit` `/lessons-remove`) — the Host writes the file directly, no model involved
- **No custom RPC**: static plugins cannot add remote namespaces, so the read path reuses DSH's built-in `workspaceFiles` remote — inherently key-free and model-free
- Known compatibility: built against DSH 0.1.5-rc.1; the slot API is fast-moving, re-verify after upgrading DSH

## Roadmap

- [x] v0.1: read-only panel (levels / search / stats)
- [x] v0.2: agent tools (notebook_read / notebook_write / notebook_hit, with auto-escalation)
- [x] v0.3: panel editing (/lessons-add /lessons-edit /lessons-remove, host-side writes)
- [ ] npm publish + screenshots
- [ ] English README — done, maintaining both languages

## License

MIT
