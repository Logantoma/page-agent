# PsySquid Web 0.1.0
## 版本开发总结、技术回顾与下一阶段 AI 交接

**版本状态：** Internal Test Build / 第一阶段研发收口  
**日期：** 2026-08-19  
**Repository：** `Logantoma/page-agent`

---

## 1. 使用方式

本文件是下一位开发 AI 的项目交接基线。不要仅依赖 README 或上游介绍，应以实际代码、Git ref 和本文记录为准。

### 证据等级

- **REMOTE-CONFIRMED**：远端 GitHub 已直接检查/修改确认。
- **LOCAL-AI-REPORTED**：本地 AI 执行命令或测试后报告。
- **USER-MANUAL-VERIFIED**：用户本人完成真实浏览器验证。

三者不得混用。

---

## 2. 版本收口基线

```text
repository:
Logantoma/page-agent

local:
D:\代码\page-agent

0.1.0 development code baseline:
7b37f2684cf34e9fa83e7190866576be4f0d7a83

frozen 0.1.0 internal test release:
release/psysquid-web-0.1.0-test
b0df39b13d00e1f3b61e5e5f995a9212c3dd43b2
```

### 重要

**下一阶段功能开发必须从当前远端 `main` 新建 feature/fix 分支。**

`7b37f2684cf34e9fa83e7190866576be4f0d7a83` 是 0.1.0 第一阶段结束时的**代码基线**。在此之后允许 `main` 出现纯文档收口提交，因此新 AI 不应要求 `main HEAD` 永远精确等于该 SHA；应先 fetch 当前 `main`，确认它包含该代码基线，且后续若有差异仅为已知文档/收口提交。

不要从 `release/psysquid-web-0.1.0-test` 继续堆功能。release 分支已经冻结用于 0.1.0 内部测试分发。

---

## 3. 0.1.0 产品定位

PsySquid Web 0.1.0 是内部测试版，不公开 Chrome Web Store。

本轮核心目标：

1. 低干扰嵌入：少占页面、少改布局、CSS 隔离、可关闭。
2. 稳定性：多页面、跨 iframe、fullscreen、Site UI Toggle、异步生命周期。
3. 用户可见去上游品牌化：PsySquid Web 品牌收口。
4. 保持上游可跟随性：尽量把 PsySquid 特有逻辑放 extension downstream。

明确未做：

- 未继续大规模工作区 UI / 状态条改版。
- 未开发反检测、规避监控或绕过安全机制。
- 未机械替换 `PAGE_AGENT_EXT_*`、`@page-agent/*`、`data-page-agent-*` 等内部标识。
- 未做 Chrome Web Store 公开发布治理。

---

## 4. 核心架构

```text
content.ts (all_frames=true)
│
├─ every frame
│   └─ initPageController()
│
└─ top frame only
    ├─ Visual Observation
    └─ InPageUiController
        └─ InPageAgentShell
            ├─ InPageLauncher
            ├─ MultiPageAgent
            └─ upstream Panel
```

### Site UI Toggle

- 按 origin 保存，例如 `https://example.com`
- 默认启用
- OFF：立即 dispose Launcher/Panel
- refresh 后保持
- ON：无需刷新立即恢复
- 不关闭 PageController / iframe / Agent plumbing / Visual Observation

### Launcher

- 官方 PsySquid SVG
- Shadow DOM 做 CSS isolation
- Host ID 保留 `page-agent-inpage-launcher`
- 保留：
  - `data-browser-use-ignore=true`
  - `data-page-agent-ignore=true`
- working pulse / breathing / halo 已撤回
- `setWorking()` plumbing 保留

### Cross-origin iframe

B4.6 已完成 tab-global index namespace、frame routing 和动作反馈回写。真实 benchmark 已 USER-MANUAL-VERIFIED PASS。

---

## 5. 关键提交

| 阶段 | Commit | 主题 |
|---|---|---|
| B4.1 | `f932fd471f834d30950d1119f0e66360ea948635` | scroll isolation |
| B4.2 | `130ea24b99b3408b21cedf72dd38036261c012da` | interactive extraction |
| B4.4 | `869c7bd55a5745dbb852ab30a1087207419f42ed` | form semantics |
| B4.5 | `9b07fc5462e3e584c0ef1bfb1d7c275846bdfdcd` | web-opened tab tracking |
| B4.6 | `3ea333191c152e95274985a09e6a9be77c7e747d` | cross-origin iframe |
| Branding | `367c253640cd8bec61eaf025fe544b4b8614ebde` | PsySquid Web 品牌化 |
| Site UI | `157960e26412a6cc1b2c09c484ab2d16c3f08b88` | per-site UI toggle |
| V2.1 | `2f854dc4f9ea73bdb665ba7b0ae092c1c02dd02c` | Shadow Launcher |
| Hardening | `7b37f2684cf34e9fa83e7190866576be4f0d7a83` | lifecycle hardening |
| Release | `b0df39b13d00e1f3b61e5e5f995a9212c3dd43b2` | extension 0.1.0 |

---

## 6. 稳定性修复

### InPageUiController race

采用 generation token：

- 每次 sync 递增 generation
- `await loadPolicy()` 返回后再次检查
- 只有最新 sync 可创建/销毁 Shell
- dispose 会使 pending sync 全部失效
- start 幂等，避免重复 storage listener

### Agent external dispose

Agent 从 Panel 等外部路径 dispose 后：

```text
launcher.setActive(false)
launcher.setWorking(false)
```

避免 Launcher 假 active 状态。

---

## 7. 品牌化边界

保留内部：

- `PageAgentExtUserAuthToken`
- `PAGE_CONTROL`
- `PAGE_AGENT_EXT_*`
- `data-page-agent-*`
- `@page-agent/*`
- `MultiPageAgent`
- IndexedDB `page-agent-ext`

这些是内部实现，不是 runtime 品牌 blocker。

当前 extension runtime 的 manifest / locale / HTML 无用户可见旧品牌 blocker。

---

## 8. 最终测试状态

LOCAL-AI-REPORTED：

```text
npm ci: PASS
typecheck: PASS
npm test: 174/174 PASS
extension tests: 105/105 PASS
build:ext: PASS
git diff --check: PASS
```

USER-MANUAL-VERIFIED：

- B4.6 iframe PASS
- Site UI Toggle PASS
- Launcher / Shadow CSS isolation PASS
- fullscreen PASS
- hardening rapid toggle / Panel close PASS
- 0.1.0 release ZIP runtime PASS

---

## 9. 0.1.0 内部测试发布物

```text
file:
psysquid-web-0.1.0-chrome.zip

size:
345,389 bytes

SHA256:
BF89864ED937BF0965AA5482F11ECF1D0F506B427B6B2D7487956E42A252C610

local:
D:\代码\page-agent\packages\extension\.output\psysquid-web-0.1.0-chrome.zip
```

Manifest：

```text
name: PsySquid Web
version: 0.1.0
icon: assets/psysquid.png
sidepanel: sidepanel.html
all_frames: true
permissions: tabs, tabGroups, sidePanel, storage
host_permissions: <all_urls>
```

本版只做内部 Chrome 开发者模式测试，不公开商店。

---

## 10. 已知延期项

### P1
Panel `#showInputArea()` 100ms 后自动 focus，可能抢网页焦点。

推荐未来最小补丁：

```ts
interface PanelConfig {
  autoFocusInput?: boolean // default true
}
```

PsySquid in-page Shell 传 `false`，upstream 默认行为不变。

### P2

- `document.body` 被整体替换时 Launcher/Panel 可能留在旧 body。
- `content.ts` 的认证 `window.message` listener 缺显式对称 dispose。

### P3

- `page-agent-64.png` / `page-agent-256.webp` 未引用旧资产
- dead `ConfigPanel.tsx` 有旧品牌文案
- `PRIVACY.md` / docs 公开发布前单独治理
- website branding 只有在 PsySquid 对外发布网站时才处理

### UI

工作区/“正在工作”状态条重设计主动延期。不要在没有真实用户反馈前自行启动。

---

## 11. 下一位 AI 标准开发 SOP

1. `git fetch origin --prune`
2. `git switch main`
3. `git log -n 3 --oneline` 并确认当前 `main` 包含 0.1.0 代码基线 `7b37f2684cf34e9fa83e7190866576be4f0d7a83`
4. 如果 `main` 已领先该 SHA，先审计 `git diff 7b37f268..main --stat`，确认领先内容是已知的文档/收口提交，而不是未经交接的新功能
5. 工作区必须 clean
6. 从当前 `main` 新建 `feature/<name>` 或 `fix/<name>`
7. 先读实际代码，再定方案；优先 extension downstream
8. 明确允许/禁止改动范围
9. 完成后：
   - `npm run typecheck`
   - `npm test`
   - extension tests
   - `npm run build:ext`
   - `git diff --check`
10. 浏览器行为必须做 USER-MANUAL-VERIFIED
11. push 后远端 compare/diff review
12. 只能 fast-forward main
13. 禁止 force push / 改写历史

### 角色

- 远端主 AI：第一责任开发人，负责架构、代码设计、远端 review/小修。
- 本地 AI：以执行测试、构建、人工验证辅助为主；不得自行扩大需求。

---

## 12. 产品与安全边界

“低干扰/低可见占用嵌入”指：

- 少占网页空间
- 少改页面布局
- 少抢焦点
- Shadow DOM CSS isolation
- 用户可关闭

不代表：

- 隐藏扩展存在
- 反检测
- 绕过监控
- 绕过焦点/全屏/反作弊
- 绕过站点安全机制

---

## 13. 推荐下一阶段

默认优先级：

1. 收集 0.1.0 内部测试真实问题。
2. 修真实 P0/P1。
3. `autoFocusInput` 低侵入补丁。
4. body replacement / listener cleanup hardening。
5. 再根据业务扩展网页操作能力或工具。
6. UI 大改继续延期。
7. Chrome Web Store / privacy / 官网作为独立发布治理项目。

---

## 14. 收口结论

**PsySquid Web 0.1.0 第一阶段开发正式结束。**

0.1.0 是冻结的内部测试基线。`7b37f268...` 是本阶段结束时的代码基线；新的研发从**当前远端 main**建独立分支推进，不在 release 分支继续开发。
