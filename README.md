# 会话主题 · Session Topics

给 DSH 的每个会话配一份**可导航的主题目录**。

长会话里，你 15 轮之前聊的话题和现在聊的往往毫无关系，回头找一个旧话题要一路往上翻。这个插件让大语言模型在后台持续把会话整理成若干个**主题**（不是逐条问答，而是按用途/工作线归并），并以两种形态呈现：

- **右侧刻度条**：替换 DSH 原生的会话刻度条，按主题重新分段，悬停展开成胶囊，点一下直达那段对话。
- **侧栏面板**：完整的主题列表，支持关键词/语意搜索、跨会话检索、继续讨论。

两个入口各有开关，可在 DSH 原生设置里分别关闭。

> **发布形态**：这是 DSH 插件（bundle），通过市场索引或 `pnpm add` 安装。

---

## 它解决什么

| 痛点 | 本插件的做法 |
|---|---|
| 会话太长，找不到某个旧话题 | LLM 增量总结成主题列表，点击直达 |
| 翻上来之后回不到当前对话 | 「回到最新」一键到底 |
| 想接着旧话题聊，得手动复制上下文 | 「继续讨论」把该主题摘要填进输入框 |
| 只记得关键词，忘了在哪个会话 | 关键词搜索 + 语义搜索，跨会话命中 |
| 已经有一堆存量会话 | 安装后自动 backfill 最近 10 个会话 |

---

## 功能

- **自动增量总结**：每轮对话结束（`turn/end`）后台增量更新主题，不重跑全量，不打断你。
- **主题跳转**：调用宿主同款的 `session.loadThrough(seq)` 按需拉取目标页，不需要手动点「加载更早」。
- **回到最新**：滚回会话末端。
- **继续讨论**：把主题摘要注入输入框（`conversation.input.shell().setDraft`），不用手打。
- **双模搜索**：关键词即时匹配（本地打分）＋「语意搜索」走 LLM 精排，都能跨会话检索。
- **右侧刻度条**：会话右边常驻一条按主题分段的刻度条，悬停展开成胶囊，逐条显示主题名与时间，点击跳到该主题开头；最下方一行「回到最新」。形态参考 WorkBuddy。
- **两个独立开关**：「显示主题刻度条」与「显示侧栏主题面板」各管一个入口，在 DSH 原生设置 →「会话主题」里切换。关掉刻度条会还原 DSH 原生刻度条。
- **模型可配**：在设置里选择总结用的 provider / 模型，与主对话模型解耦。
- **访问检查**：所有 HTTP 路由都先过 DSH 自己的 `connection.requestRejection()`，浏览器里打开的任意网页读不到你的主题数据。
- **状态可见**：整理中显示 spinner，完成绿 ✓，失败红点；主题行显示相对时间，刚更新的主题高亮。
- **多会话初始化**：首次安装自动整理最近 10 个会话，面板上可暂停/继续。

---

## 安装

### 方式一：从市场索引安装（推荐）

1. 打开 Web 侧栏 → **插件** → 在**实验性插件**下启用**自定义插件索引**
2. 切到**发现**标签页，添加索引源：

```
https://raw.githubusercontent.com/weseeon/dsh-session-topics/main/market-index.json
```

3. 搜索 `会话主题` 或 `session-topics`，点击安装

### 方式二：直接安装

```bash
# 在 DSH profile 目录下
pnpm add github:weseeon/dsh-session-topics
```

然后重启 DSH（或重载插件）。

---

## 依赖与两种运行形态

| 形态 | 条件 | 表现 |
|---|---|---|
| **侧边栏页**（推荐） | 已安装 [`dsh-better-sidebar`](https://github.com/) | 主题面板作为该侧边栏的一个 tab 出现 |
| **独立运行** | 未安装 better-sidebar | 会话页右下角出现浮动按钮「打开主题面板」，点击弹出抽屉面板 |

`dsh-better-sidebar` 是 **可选 peer 依赖**：装了就用它的容器，没装也能独立工作。

---

## 使用

### 刻度条（右侧常驻）

会话右侧边缘有一条 40px 宽的刻度条，每 2px 一格代表一个主题。

- **悬停**展开成 320px 胶囊，逐行显示「日期时间 · 主题名 · 刻度」
- **点击某行**跳到该主题开头的对话
- **最下方「回到最新」**滚回会话末尾
- 当前所在主题的刻度更粗更长；胶囊只显示一屏行数，滚动查看更多

### 侧栏面板

1. 打开一个会话，输入框下方点「主题」按钮（或右侧栏 tab）
2. 主题列表按时间倒序，每行显示标题、轮次范围、相对时间
3. 点击主题 → 跳到该段对话开头
4. 底部「↓ 回到最新」→ 回到底部
5. 主题行悬停出现「继续讨论」→ 摘要填进输入框
6. 顶部搜索框：
   - 默认**本会话**范围，输入关键词即时匹配
   - 切**全局**跨会话搜索
   - 关键词没命中时点**语意搜索**，让 LLM 找相关主题
7. 顶部「整理」→ 立即增量整理；「重新总结」→ 丢弃重建（会确认）

---

## 配置

### DSH 原生设置（推荐）

**设置 → 会话主题**：

| 项 | 说明 |
|---|---|
| 显示主题刻度条 | 替换 DSH 会话右侧的原生刻度条；关闭后恢复原生刻度条 |
| 显示侧栏主题面板 | 输入框下方「主题」按钮 + Better Sidebar 标签页；关闭后一并收起 |
| 总结模型 | 总结用的 provider / 模型 |
| 主题数量上限 | 单会话最多保留多少个主题 |
| 首次回填回合数 | 新会话载入时向前整理多少个历史回合 |

改动即时生效，写入插件自己的 `storageDomain`。

### `cordis.patch.yml`
| 字段 | 默认 | 说明 |
|---|---|---|
| `enableRail` | `true` | 显示右侧主题刻度条（覆盖原生刻度条） |
| `enableSidebar` | `true` | 显示输入框「主题」按钮与侧栏标签页 |
| `summarizer.provider` | `deepseek-official` | 总结用 provider |
| `summarizer.model` | `deepseek-flash` | 总结用模型 |
| `autoUpdate` | `true` | 每轮后自动增量总结 |
| `maxTopics` | `20` | 单会话最多保留主题数 |
| `assistantExcerptChars` | `500` | 助手消息截断长度（控制 token） |
| `language` | `auto` | 主题语言：`auto` / `zh` / `en` |
| `initBackfillCount` | `10` | 首次安装 backfill 的会话数 |
| `searchResultLimit` | `50` | 搜索返回上限 |
| `semanticCandidateLimit` | `100` | 语意搜索候选主题数 |

---

## 数据与隐私

- 主题数据存在 DSH 本地 `storageDomain`（domain `session_topics`），**不上传任何服务器**。
- 只有「整理主题」这一步会把**会话摘录**发给你配置的 LLM provider。
- 摘录规则：用户消息取全文，助手消息截断到 `assistantExcerptChars` 字（默认 500），工具调用只取工具名。
- 插件代码中不含任何 API Key、凭据或硬编码用户路径。

---

## 兼容性

- DSH `>= 0.2.1-rc.3`
- Node `^22.19.0 || >= 24.0.0`
- 已测试：DSH Desktop（macOS）

---

## 已知限制

- **热更新会白屏一次**：本插件 inject 了 `betterSidebar` 等第三方 Client 服务，`remove_bundle` / `set_plugin` 触发热重载时旧 tab 组件销毁不干净，可能导致一次白屏。**重启 DSH 即恢复**，无持久损坏。改此插件时建议直接重启。
- 主题跳转依赖宿主 `loadThrough(seq)`；极端长会话（>1 万条事件）首次跳转会稍慢。
- LLM 输出偶发非法 JSON，已内置平衡括号提取 + 修复 + 一次重试；仍失败时该轮跳过并在下次补齐。
- 语义搜索消耗一次 LLM 调用，候选主题过多时较慢。

---

## English

### Session Topics

An LLM-maintained **topic outline** for every DSH conversation, with two entry points: an always-on **capsule rail** on the right edge of the conversation, and a searchable right-sidebar panel.

Long sessions drift across unrelated subjects. This plugin has the model continuously fold turns into a short list of topics (grouped by intent/workstream, not one entry per Q&A), so you can jump straight to a topic, return to the latest exchange, continue an old thread, and search topics across sessions.

**Features**: incremental summarization on every `turn/end`; a WorkBuddy-style capsule rail (hover to expand, per-topic date column, click to jump, back-to-latest row) that replaces the native tick strip; jump via the host's own `session.loadThrough(seq)`; continue-discussion draft injection; keyword + LLM semantic search (session-scoped or global); status indicators; backfill of the 10 most recent sessions on install.

**Settings**: both entry points toggle independently under *Settings → Session topics* (turning the rail off restores the native strip), next to the summarizer model and the topic/backfill limits.

**Install**: enable *Experimental plugins → Custom plugin indexes*, then add
`https://raw.githubusercontent.com/weseeon/dsh-session-topics/main/market-index.json`
Or `pnpm add github:weseeon/dsh-session-topics`.

**Runs with or without** [`dsh-better-sidebar`](https://github.com/): with it the panel is a sidebar tab; without it a floating button opens the panel in a drawer.

**Security**: every HTTP route this plugin registers runs DSH's own `connection.requestRejection()`, so a web page open in your browser cannot read your topics.

**Privacy**: topics live in DSH local storage (`session_topics`) and never leave your machine. Only the summarization step sends a session excerpt to your configured LLM provider (user messages full, assistant messages truncated to `assistantExcerptChars`, tool calls by name only).

**Known limitation**: hot-reloading this plugin may blank the client once — restart DSH to recover.

**License**: MIT

---

## License

MIT © weseeon
