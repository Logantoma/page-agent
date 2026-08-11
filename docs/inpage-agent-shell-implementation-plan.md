# In-Page Agent Shell Implementation Plan

Date: 2026-08-11
Branch: `feature/inpage-agent-shell`
Base: `main @ d02db1ee7c41f5315beda88bab2fe935c580f662`

## 1. Product goal

Turn the existing Page Agent Chrome extension into an **independent in-page agent experience**:

- Keep Page Agent's existing `MultiPageAgent`, LLM configuration, DOM/page controller and tab-control capabilities.
- Add a small floating launcher inside ordinary web pages.
- Clicking the launcher opens the Agent UI **inside the current page**, not in a Chrome Side Panel.
- The in-page UI must be able to execute the same normal Page Agent browser tasks: page reading, click, input, select, scroll and multi-tab tasks.
- Do **not** integrate PsySquid, Native Messaging, local desktop IPC or a PsySquid tool adapter in this phase.

This phase is a Page Agent fork product change, not a PsySquid integration project.

## 2. Non-goals

Do not do any of the following in this branch unless a later task explicitly reopens the scope:

- No PsySquid dependency or branding dependency.
- No Native Messaging.
- No MCP redesign.
- No rewrite of `PageAgentCore`, `PageController`, `RemotePageController`, or tab action semantics.
- No replacement of the existing independent LLM/Agent architecture.
- No anti-detection/evasion behavior. Fullscreen work in this plan is only UI compatibility work.
- No deletion of Side Panel in the first implementation pass.

## 3. Existing code that must be reused

### Agent runtime

`packages/extension/src/agent/MultiPageAgent.ts`

Important existing design statement:

```ts
/**
 * MultiPageAgent
 * - use with extension
 * - can be used from a side panel or a content script
 */
export class MultiPageAgent extends PageAgentCore { ... }
```

Do not create a second Agent implementation.

### Page control bridge

`packages/extension/src/agent/RemotePageController.ts`

Already provides:

```ts
getBrowserState()
updateTree()
cleanUpHighlights()
clickElement()
inputText()
selectOption()
scroll()
scrollHorizontally()
```

### Content-side controller

`packages/extension/src/agent/RemotePageController.content.ts`

Already initializes `PageController` and handles `PAGE_CONTROL` messages. Preserve this path.

### Existing in-page UI

`packages/ui/src/panel/Panel.ts`

The existing Panel is already a DOM overlay and must be reused rather than recreating the chat/status UI from scratch.

### Existing extension config

Reuse the exact storage model already used by `packages/extension/src/agent/useAgent.ts`:

```text
llmConfig
language
advancedConfig
```

Reuse `DEMO_CONFIG` and `migrateLegacyEndpoint` from `packages/extension/src/agent/constants`.

## 4. Target architecture for Phase A

```text
Current web page
│
├── Page Agent floating launcher       [new]
│       │
│       └── toggle
│
├── @page-agent/ui Panel               [reuse]
│       │
│       └── MultiPageAgent             [reuse]
│               │
│               ├── TabsController
│               └── RemotePageController
│                       │
│                       └── chrome.runtime messages
│
├── RemotePageController.content       [reuse]
│       └── PageController
│
└── extension background               [reuse]
        ├── TAB_CONTROL
        └── PAGE_CONTROL
```

The first implementation must keep the existing Side Panel source intact as a fallback/configuration surface. It is not the primary interaction surface after Phase A is accepted.

## 5. Phase A1 — minimal in-page Agent shell

### Task A1.1 — add config loader

Create:

`packages/extension/src/inpage/loadAgentConfig.ts`

Responsibilities:

1. Read `llmConfig`, `language`, and `advancedConfig` from `chrome.storage.local`.
2. Use the same default and migration behavior as `useAgent.ts`.
3. Return the same effective configuration shape expected by `MultiPageAgent`.
4. Do not introduce a second configuration schema.

Reference behavior to preserve:

```ts
let llmConfig = (result.llmConfig as LLMConfig) ?? DEMO_CONFIG
const language = (result.language as SupportedLanguage) || undefined
const advancedConfig = (result.advancedConfig as AdvancedConfig) ?? {}
const migrated = migrateLegacyEndpoint(llmConfig)
```

Prefer extracting shared config-loading logic if it can be done without changing behavior in Side Panel. Do not copy-paste two implementations that can drift.

### Task A1.2 — add floating launcher

Create:

`packages/extension/src/inpage/InPageLauncher.ts`

Minimum behavior:

- One launcher per top-level document.
- Fixed-position circular button, default bottom-right.
- High but sane z-index.
- Must carry both attributes:

```html
data-browser-use-ignore="true"
data-page-agent-ignore="true"
```

so Page Agent does not reason about or operate its own launcher.

- Launcher click calls a supplied callback only. It must not directly instantiate controllers, manipulate tab state, or execute tasks.
- No drag behavior in A1.
- No persistence in A1.
- No global keyboard shortcuts in A1.

### Task A1.3 — add shell lifecycle owner

Create:

`packages/extension/src/inpage/InPageAgentShell.ts`

This class/function owns only the in-page Agent presentation lifecycle.

Required state:

```ts
let agent: MultiPageAgent | null
let panel: Panel | null
let launcher: InPageLauncher
let opened: boolean
```

Required behavior:

1. Launcher is created when the content script initializes.
2. `MultiPageAgent` and `Panel` are **lazy-created on the user's first launcher click**, not on page load.
3. Lazy creation is mandatory because `Panel` currently focuses its input area; constructing it during page load could unexpectedly move page focus.
4. First click:
   - load stored Agent config;
   - construct `MultiPageAgent`;
   - construct `Panel(agent, ...)`;
   - show Panel.
5. Later clicks toggle Panel visibility.
6. Closing/hiding the Panel must not automatically dispose the Agent while a task is running.
7. On content-script disposal/navigation, dispose the local Agent and remove UI cleanly.

Do not add a second history store. The Panel must render the existing Agent history/event stream.

### Task A1.4 — wire shell into content script

Modify:

`packages/extension/src/entrypoints/content.ts`

Current responsibility must remain:

```ts
initPageController()
```

Add in-page shell initialization after controller initialization.

Conceptual shape:

```ts
main() {
    initPageController()
    initInPageAgentShell()
    // preserve the existing authenticated page-exposure path
    ...
}
```

Do not remove the current `PageAgentExtUserAuthToken` / `exposeAgentToPage()` behavior in A1.

### Task A1.5 — preserve Side Panel as fallback

Do not change the following yet:

- `packages/extension/src/entrypoints/sidepanel/App.tsx`
- `chrome.sidePanel.setPanelBehavior(...)`
- existing ConfigPanel behavior

Reason: A1 must isolate the variable to **in-page interaction surface only**. Configuration and Side Panel removal are separate phases.

## 6. Phase A1 tests and acceptance

### Automated

Add focused tests for:

- config-loading defaults/migration;
- launcher single-instance guard;
- shell lazy initialization;
- second launcher click toggles existing Panel instead of creating another Agent;
- cleanup disposes Agent exactly once;
- launcher root contains the two Agent-ignore attributes.

Do not write tests that merely grep source text unless a runtime/unit assertion is impractical.

### Manual acceptance matrix

Use at least:

1. simple static HTML page;
2. React/Vue SPA;
3. long scroll page;
4. form page with text input, select and button;
5. page where Agent opens another tab;
6. page reload while Agent is idle;
7. page reload/navigation during a running task — record actual behavior even if it exposes a lifecycle limitation.

Required A1 functional scenario:

```text
open normal page
→ launcher visible
→ click launcher
→ in-page Panel visible
→ enter "read this page and tell me its main heading"
→ Agent returns result
→ enter a task that clicks a normal button
→ action succeeds
→ enter a task that fills a normal text field
→ input succeeds
```

### Regression checks

- Existing Side Panel still works.
- Existing extension config still loads.
- Existing multi-tab behavior from Side Panel is unchanged.
- `npm`/workspace typecheck and relevant extension tests pass.
- Extension build succeeds.

## 7. Phase A2 — fullscreen-compatible mounting

Do this only after A1 passes.

Problem:

The current `Panel` appends itself to `document.body`. If a site uses `requestFullscreen()` on a specific descendant element rather than the whole document, a sibling under `body` may not appear inside the fullscreen top layer.

### Task A2.1 — make Panel mount target configurable

Extend `PanelConfig` in:

`packages/ui/src/panel/Panel.ts`

Add an optional mount target with default behavior unchanged.

Conceptual API:

```ts
export interface PanelConfig {
    language?: SupportedLanguage
    promptForNextTask?: boolean
    mountTarget?: Element
}
```

Replace hard-coded:

```ts
document.body.appendChild(wrapper)
```

with a resolved mount target while preserving `document.body` as the default.

Do not add Shadow DOM in this phase.

### Task A2.2 — follow fullscreen target

`InPageAgentShell` listens for `fullscreenchange`.

Resolve current UI mount target as:

```ts
const mountTarget = document.fullscreenElement ?? document.body
```

When fullscreen target changes, move the existing launcher and Panel wrapper under the new target rather than rebuilding the Agent.

Acceptance matrix:

- no fullscreen;
- `document.documentElement.requestFullscreen()`;
- `document.body.requestFullscreen()`;
- descendant `#app.requestFullscreen()`;
- exit fullscreen;
- repeated enter/exit.

The Agent instance and task/history state must survive UI reparenting.

## 8. Phase A3 — replace Side Panel as primary entry

Do this only after A1 + A2 are accepted.

Goals:

- Toolbar action toggles the in-page shell on the active tab rather than opening Side Panel.
- Move/duplicate only the minimum necessary configuration UI into an in-page settings surface.
- Keep one storage schema (`llmConfig`, `language`, `advancedConfig`).
- Remove Side Panel only after in-page configuration can fully replace it.

Do not delete Side Panel simply because A1 launcher works.

## 9. Known lifecycle risk to test, not guess

Running `MultiPageAgent` from a content-script context is explicitly supported by the current source, but a same-tab full navigation destroys that page's content-script JavaScript context.

Therefore A1 must record what happens when:

```text
Agent runtime is hosted in current page content script
→ action causes same-tab navigation
→ old content-script context is destroyed
```

Do not pre-emptively redesign the runtime host before reproducing the problem.

If A1 proves this breaks important tasks, open a separate Phase B architecture task for a stable extension runtime host. Candidates must be evaluated separately; do not mix that redesign into the in-page UI patch.

## 10. Explicit engineering boundaries

The implementation is rejected if it:

- forks or duplicates `PageController` logic;
- creates a second DOM action protocol;
- creates a second Agent/LLM stack;
- rewrites MultiPageAgent simply to display UI in-page;
- removes Side Panel before A1/A2 acceptance;
- silently changes existing LLM configuration semantics;
- mixes PsySquid integration into this branch;
- introduces browser-monitoring bypass logic as part of UI work.

## 11. Expected first delivery

The first local implementation report must contain:

```text
Branch:
Base SHA:
New HEAD:

Changed files:

A1 launcher visible on ordinary page: pass/fail
A1 lazy Agent creation: pass/fail
In-page Panel task execution: pass/fail
DOM click: pass/fail
DOM text input: pass/fail
Side Panel regression: pass/fail
Multi-tab regression: pass/fail
Same-tab navigation during task: observed result

Tests:
Build:
git diff --check:
Working tree:

Known limitations:
```

Do not claim fullscreen compatibility until Phase A2 is actually implemented and manually tested.
