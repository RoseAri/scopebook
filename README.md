# Scopebook

A private workspace for one independent UX/UI designer. It takes a client inquiry through
scoping, a rule-based estimate, designer review, a final quote and a contract — and keeps
the reasoning behind every price.

> No AI anywhere. Every number comes from deterministic, editable rules in **My Baseline**
> and **Pricing**, and every change is versioned with its reason.

## Two parts

| | What it is | Where it runs |
| --- | --- | --- |
| **Client questionnaire** | The page your clients open from their private link | Public, on GitHub Pages |
| **Designer workspace** | Projects, estimates, quotes, contracts, settings | Only on your computer |

The client site is built from `client.html` / `src/client-main.jsx` and contains none of
the workspace. Your projects are stored in your browser and are never uploaded anywhere.

```bash
npm install            # once
npm run dev            # workspace at http://localhost:5173 (always this address)
npm run build:client   # client site only, in dist-client/
npm test               # estimation engine tests (Node 20+)
```

On a Mac you can double-click `啟動設計師工作區.command` instead of typing commands
(Windows: `啟動設計師工作區.bat`). Keep the window open while you work.

A full step-by-step guide in Traditional Chinese is in `部署說明.md`.

## How the private link works (no backend)

```
Designer creates project ─► private link  #/quote/<random token>?d=<compressed setup>
                                  │
Client opens link ─► answers stay in the client's browser
                                  │
Client submits ─► reply code (SB1.…) or reply file ─► Designer: "Import reply"
                                  │
                     Preliminary Estimate v1 + Preliminary Quote Q1 created (locked)
```

- The token is 12 cryptographically random characters. The payload lives after `#`, so it
  is never sent to any web server.
- The link carries only what the questionnaire needs (project name, your baseline, rules
  and pricing). Unedited starter functions travel as references to keep links short.
- There is no revoke button: without a server, a link already sent cannot be switched off.
  Links expire instead (Settings → Links valid for), and can be extended per project.
- If the client fills it in on your own computer (e.g. in a meeting), or you use
  **Preview as client**, the project overview offers to import that reply directly.
- The client's progress appears in your workspace when you import a reply. They can send
  an updated code at any time; the workspace flags answers that changed after v1.

For production use with sensitive client data, replace `src/store/storage.js` and the
return-code step with a real backend and authentication.

## Where things are

| Area | Files |
| --- | --- |
| Estimation engine (pure, tested) | `src/engine/estimate.js`, `versions.js`, `quote.js`, `contract.js` |
| Starter data (editable in the app) | `src/data/baseline.js`, `pricing.js`, `contracts.js`, `questionnaire.js` |
| Client questionnaire | `src/client/` |
| Designer workspace | `src/designer/` |
| Documents (PDF layer) | `src/documents/templates.js` (HTML blocks), `export.js` (browser output) |
| Persistence | `src/store/storage.js` (swap for a backend later), `store.js`, `actions.js` |
| Interface text (繁中 / EN) | `src/i18n/strings.js` |

### Estimation model

Base effort per function (Basic / Advanced) → complexity signals that only apply to the
functions they affect (flow, states, roles, data, exceptions, integrations) → responsive,
existing-system, technical and content effort → coordination → range widened by
confidence → hours × rate + your adjustment rules. Risk and schedule pressure are separate
tracks, never one score. Custom requirements are never priced automatically.

### Versioning

- Estimates: drafts are editable; **Lock** freezes the system result and overrides. New
  versions copy the latest one; nothing is overwritten. Each version shows a diff and the
  designer's reason.
- Quotes: immutable snapshots of a locked estimate (status can change).
- Contracts: generated from a Final Quote and a template (the template is never changed),
  edited, saved as revisions or final, and continuously checked against the quote.

### PDFs

`Download PDF` renders A4 pages in the browser (Chinese always displays correctly; text
is not selectable). `Print / save as PDF` uses the browser's print dialog for a
text-selectable PDF. Documents are rebuilt from locked records, so a version's PDF is
always the same.

## Data

Your workspace is stored in your browser, for the address `http://localhost:5173`. Open it
in the same browser at the same address each time.

**Automatic backup (Chrome / Edge):** Settings → Data and backup → Choose backup folder.
Every change is written to `scopebook-workspace.json` (latest) and
`scopebook-backup-YYYY-MM-DD.json` (one per day) in that folder. An empty workspace is never
written over a backup. If browser data is cleared, use **Restore from backup folder** on
the Projects page. Other browsers: use **Download backup** regularly. Never commit a backup file to
GitHub (`.gitignore` already excludes `scopebook-backup-*.json`).
