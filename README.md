# 会话主题 · Session Topics

给 DSH 的每个会话配一份**可导航的主题目录**。

长会话里，你 15 轮之前聊的话题和现在聊的往往毫无关系，回头找一个旧话题要一路往上翻。这个插件让大语言模型在后台持续把会话整理成若干个**主题**（不是逐条问答，而是按用途/工作线归并），显示在右侧栏里：点一下就跳到那段对话，一键回到最新，还能从旧主题接着聊。

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
- **模型可配**：面板右上 ⚙ 选择总结用的 provider / 模型，与主对话模型解耦。
- **状态可见**：整理中显示 spinner，完成绿 ✓，失败红点；主题行显示相对时间，刚更新的主题高亮。
- **多会话初始化**：首次安装自动整理最近 10 个会话，面板上可暂停/继续。

---

## 安装

### 方式一：从市场索引安装（推荐）

1. 打开 Web 侧栏 → **插件** → 在**实验性插件**下启用**自定义插件索引**
2. 切到**发现**标签页，添加索引源：

```
https://raw.githubusercontent.com/weiyuxiang/dsh-session-topics/main/market-index.json
```

3. 搜索 `会话主题` 或 `session-topics`，点击安装

### 方式二：直接安装

```bash
# 在 DSH profile 目录下
pnpm add github:weiyuxiang/dsh-session-topics
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

1. 打开一个会话，右侧栏/浮动按钮里打开「主题」
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

### 面板内（推荐）
右上 ⚙ → 选择 provider 与模型 → 保存。立即生效于下一次整理。

### `cordis.patch.yml`
| 字段 | 默认 | 说明 |
|---|---|---|
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

An LLM-maintained **topic outline** for every DSH conversation, rendered in the right sidebar.

Long sessions drift across unrelated subjects. This plugin has the model continuously fold turns into a short list of topics (grouped by intent/workstream, not one entry per Q&A), so you can jump straight to a topic, return to the latest exchange, continue an old thread, and search topics across sessions.

**Features**: incremental summarization on every `turn/end`; jump via the host's own `session.loadThrough(seq)`; back-to-latest; continue-discussion draft injection; keyword + LLM semantic search (session-scoped or global); per-plugin model selection; status indicators; backfill of the 10 most recent sessions on install.

**Install**: enable *Experimental plugins → Custom plugin indexes*, then add
`https://raw.githubusercontent.com/weiyuxiang/dsh-session-topics/main/market-index.json`
Or `pnpm add github:weiyuxiang/dsh-session-topics`.

**Runs with or without** [`dsh-better-sidebar`](https://github.com/): with it the panel is a sidebar tab; without it a floating button opens the panel in a drawer.

**Privacy**: topics live in DSH local storage (`session_topics`) and never leave your machine. Only the summarization step sends a session excerpt to your configured LLM provider (user messages full, assistant messages truncated to `assistantExcerptChars`, tool calls by name only).

**Known limitation**: hot-reloading this plugin may blank the client once — restart DSH to recover.

**License**: MIT

---

## License

MIT © weiyuxiang
