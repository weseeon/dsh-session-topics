/**
 * Session Topics — Client half.
 *
 * Registers the "Topics" page in dsh-better-sidebar's sidebar through the
 * ctx.betterSidebar service: a live topic list fed by the Host half over
 * HTTP + SSE, with jump-to-topic scrolling, back-to-latest,
 * continue-discussion draft injection, keyword search, LLM semantic search,
 * and cross-session navigation from global search results.
 */
window.__DSH_TOPICS_BOOT__ = "loaded@" + Date.now();
console.log("[session-topics] module factory entered");
window.__ModuleLoader__.load({
	id: "dsh-session-topics",
	factory(require) {
		const React = require("react");
		const { createRoot } = require("react-dom/client");
		const { useState, useEffect, useMemo, useRef, useCallback } = React;
		const h = React.createElement;

		const NS = "sessionTopics";
		const ROUTE = "/plugins/session-topics/";

		const dictionaries = {
			zh: {
				"tab.title": "主题",
			"tab.description": "本会话的主题导航：LLM 整理的主题列表，点击跳转、继续讨论",
				"search.placeholder": "搜索主题…",
				"search.scope.session": "本会话",
				"search.scope.global": "全局",
				"search.semantic": "语意搜索",
				"search.semanticBusy": "检索中…",
				"search.empty": "无关键词命中，试试语意搜索",
				"search.semanticEmpty": "语意搜索也无相关主题",
				"search.hitsPrefix": "命中",
				"search.hitsSuffix": "个主题",
				"search.reason": "理由",
				"header.title": "主题",
				"header.close": "收起面板",
				"action.refresh": "整理",
				"action.resummarize": "重新总结",
				"action.resummarize.confirm": "丢弃现有主题列表并全量重建？",
				"status.idle": "就绪",
				"status.summarizing": "整理中…",
				"status.error": "上次整理失败",
				"status.loading": "加载中…",
				"backfill.prefix": "初始化",
				"backfill.pausedPrefix": "已暂停",
				"backfill.pause": "暂停",
				"backfill.resume": "恢复",
				"topic.continue": "继续讨论",
				"topic.turnsPrefix": "#",
				"backToLatest": "回到最新",
				"continue.prefix": "接着这个话题讨论",
				"continue.ok": "已填入输入框",
				"continue.fallback": "已复制摘要，请粘贴到输入框",
				"empty.noTopics": "对话开始后自动整理主题",
				"empty.error": "加载失败",
				"jump.failed": "未找到该主题的消息位置",
				"open.button": "打开主题面板",
				"config.title": "总结模型",
				"config.provider": "Provider",
				"config.model": "模型",
				"config.save": "保存",
				"config.saved": "已保存，下次整理生效",
				"config.hint": "从当前可用的对话模型中选择，用于主题总结",
			},
			en: {
				"tab.title": "Topics",
			"tab.description": "Topic navigation for this session: LLM-organized topics with jump and continue",
				"search.placeholder": "Search topics…",
				"search.scope.session": "Session",
				"search.scope.global": "All",
				"search.semantic": "Semantic",
				"search.semanticBusy": "Ranking…",
				"search.empty": "No keyword hits; try semantic search",
				"search.semanticEmpty": "Semantic search found nothing either",
				"search.hitsPrefix": "Found",
				"search.hitsSuffix": "topics",
				"search.reason": "Why",
				"header.title": "Topics",
				"header.close": "Collapse panel",
				"action.refresh": "Summarize",
				"action.resummarize": "Rebuild",
				"action.resummarize.confirm": "Discard the current topic list and rebuild from scratch?",
				"status.idle": "Ready",
				"status.summarizing": "Summarizing…",
				"status.error": "Last run failed",
				"status.loading": "Loading…",
				"backfill.prefix": "Backfill",
				"backfill.pausedPrefix": "Paused",
				"backfill.pause": "Pause",
				"backfill.resume": "Resume",
				"topic.continue": "Continue",
				"topic.turnsPrefix": "#",
				"backToLatest": "Back to latest",
				"continue.prefix": "Continue this topic",
				"continue.ok": "Inserted into the composer",
				"continue.fallback": "Summary copied; paste it into the composer",
				"empty.noTopics": "Topics appear as the conversation grows",
				"empty.error": "Failed to load",
				"jump.failed": "Could not locate that topic in the transcript",
				"open.button": "Open the Topics panel",
				"config.title": "Summarizer",
				"config.provider": "Provider",
				"config.model": "Model",
				"config.save": "Save",
				"config.saved": "Saved; applies from the next run",
				"config.hint": "Pick one of the available chat models for topic summarization",
			},
		};

		async function api(path, options) {
			const response = await fetch(ROUTE + path, options);
			if (!response.ok) throw new Error(`session-topics ${response.status}`);
			return response.json();
		}

		function post(path, body) {
			return api(path, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body ?? {}),
			});
		}

		// ---------- scrolling ----------

		function chatScroller() {
			return document.querySelector("[data-conversation-scroll]");
		}

		function delay(ms) {
			return new Promise((resolve) => setTimeout(resolve, ms));
		}

		/** Compact relative time: 刚刚 / N 分钟前 / N 小时前 / N 天前. */
		function formatRelative(at, now) {
			const stamp = at < 1e12 ? at * 1000 : at; // tolerate legacy second-level stamps
			const delta = Math.max(0, now - stamp);
			if (delta < 60_000) return "1m";
			if (delta < 3_600_000) return `${Math.floor(delta / 60_000)}m`;
			if (delta < 86_400_000) return `${Math.floor(delta / 3_600_000)}h`;
			return `${Math.floor(delta / 86_400_000)}d`;
		}

		/**
		 * The "load earlier" control, when one is mounted.
		 * DOM: div[data-chat-flow] (the column) holds the older div before the
		 * div[data-slot="conversation.chat.flow"] row container:
		 * column > div.older > button, then column > [data-slot=flow] > rows.
		 */
		function olderButton(scroller) {
			const column = scroller.querySelector("[data-chat-flow]");
			if (column === null) return null;
			const flow = column.querySelector(':scope > [data-slot="conversation.chat.flow"]');
			for (const child of column.children) {
				if (child === flow) break;
				if (child.tagName !== "DIV" || child.hasAttribute("hidden")) continue;
				const button = child.querySelector(":scope > button");
				if (button !== null) return button.disabled ? null : button;
			}
			return null;
		}

		/**
		 * Scroll the transcript to the first row at or after `turn`.
		 * When the target predates the loaded window, clicks "load earlier"
		 * until the row mounts, then aligns it.
		 * @param {number} turn - target agent turn.
		 * @returns whether a row was found and aligned.
		 */
		/** Report the chat DOM shape to the Host when a jump fails, for offline diagnosis. */
		function reportJumpDiagnostic(turn) {
			const scroller = chatScroller();
			const column = scroller !== null ? scroller.querySelector("[data-chat-flow]") : null;
			const flow = scroller !== null ? scroller.querySelector('[data-slot="conversation.chat.flow"]') : null;
			const rows = scroller !== null ? scroller.querySelectorAll("[data-chat-turn]:not([hidden])") : [];
			const payload = {
				turn,
				hasScroller: scroller !== null,
				hasColumn: column !== null,
				hasFlow: flow !== null,
				columnChildCount: column !== null ? column.children.length : 0,
				columnChildren:
					column !== null
						? Array.from(column.children).slice(0, 8).map((child) => ({
								tag: child.tagName,
								hidden: child.hasAttribute("hidden"),
								slot: child.getAttribute("data-slot"),
								chatFlow: child.hasAttribute("data-chat-flow"),
								hasButton: child.querySelector("button") !== null,
								text: (child.textContent ?? "").slice(0, 50),
							}))
						: [],
				rowTurnsHead: Array.from(rows).slice(0, 8).map((row) => row.getAttribute("data-chat-turn")),
				rowTurnsTail: Array.from(rows).slice(-5).map((row) => row.getAttribute("data-chat-turn")),
			};
			post("diagnostic", payload).catch(() => {});
		}

		/**
		 * Jump to a topic: first ask the host chat to fetch the page holding the
		 * topic's first message (the built-in turn navigator's own path), then
		 * align the row; DOM paging remains the fallback.
		 */
		async function jumpToTopic(topic, loadThrough) {
			if (typeof loadThrough === "function") {
				try {
					await loadThrough(topic.startSeq);
				} catch {
					/* fall back to DOM paging */
				}
			}
			return scrollToTurn(topic.startTurn);
		}

		async function scrollToTurn(turn) {
			for (let attempt = 0; attempt < 60; attempt += 1) {
				const scroller = chatScroller();
				if (scroller === null) {
					await delay(350);
					continue;
				}
				const rows = scroller.querySelectorAll("[data-chat-turn]:not([hidden])");
				let target = null;
				let firstTurn = Number.POSITIVE_INFINITY;
				for (const row of rows) {
					const value = Number(row.getAttribute("data-chat-turn"));
					if (!Number.isSafeInteger(value)) continue;
					if (value < firstTurn) firstTurn = value;
					if (value >= turn && target === null) target = row;
				}
				if (target !== null) {
					target.scrollIntoView({ behavior: "smooth", block: "start" });
					return true;
				}
				if (firstTurn > turn) {
					const older = olderButton(scroller);
					if (older !== null) {
						older.click();
						await delay(900);
						continue;
					}
				}
				await delay(350);
			}
			reportJumpDiagnostic(turn);
			return false;
		}

		function scrollToBottom() {
			const scroller = chatScroller();
			if (scroller !== null) scroller.scrollTo({ top: scroller.scrollHeight, behavior: "smooth" });
		}

		/** A jump requested from another session's panel, consumed once the target panel loads. */
		const pendingJump = { sessionId: null, turn: 0, seq: 0 };

		// ---------- styles ----------

		const CSS = `
.stp-root{display:flex;flex-direction:column;height:100%;min-height:0;font-size:13px;color:var(--dsw-alias-label-primary)}
.stp-search{display:flex;align-items:center;gap:6px;padding:10px 12px 6px}
.stp-input{flex:1;min-width:0;box-sizing:border-box;height:28px;border:.5px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-sm);background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);padding:0 8px;font:inherit}
.stp-input:focus{outline:none;border-color:var(--dsw-alias-state-business-primary)}
.stp-scope{display:flex;border:.5px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-sm);overflow:hidden;flex:none}
.stp-scope button{border:0;background:transparent;color:var(--dsw-alias-label-secondary);padding:4px 8px;font-size:12px;cursor:pointer;line-height:1}
.stp-scope button.stp-on{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
.stp-semantic{flex:none;height:28px;border:.5px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-sm);background:transparent;color:var(--dsw-alias-label-secondary);padding:0 8px;font-size:12px;cursor:pointer}
.stp-semantic:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
.stp-semantic:disabled{opacity:.5;cursor:default}
.stp-head{display:flex;align-items:center;gap:8px;padding:6px 12px 8px;border-bottom:.5px solid var(--dsw-alias-border-l1)}
.stp-fab{position:fixed;right:18px;bottom:96px;z-index:60;display:flex;align-items:center;gap:6px;padding:8px 12px;border:0;border-radius:999px;background:var(--dsw-alias-interactive-bg-accent);color:#fff;font-size:12px;cursor:pointer;box-shadow:0 4px 14px rgba(0,0,0,.22)}
.stp-fab:hover{filter:brightness(1.06)}
.stp-standaloneOverlay{position:fixed;inset:0;z-index:61;background:rgba(0,0,0,.28);display:flex;justify-content:flex-end}
.stp-standalone{width:min(420px,92vw);height:100%;background:var(--dsw-alias-bg-elevated,#fff);display:flex;flex-direction:column;box-shadow:-8px 0 24px rgba(0,0,0,.18);overflow:hidden}
.stp-headTitle{font-weight:600;flex:1}
.stp-headBtn{border:0;background:transparent;color:var(--dsw-alias-label-secondary);padding:3px 6px;border-radius:var(--dsw-radius-sm);font-size:12px;cursor:pointer}
.stp-headBtn:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
.stp-statusIcon{display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;flex:none}
.stp-spinner{width:14px;height:14px;border:2px solid var(--dsw-alias-border-l2);border-top-color:var(--dsw-alias-state-business-primary);border-radius:50%;animation:stp-spin .8s linear infinite;flex:none}
@keyframes stp-spin{to{transform:rotate(360deg)}}
.stp-check{color:var(--dsw-alias-state-success-primary,#3fb27f);font-weight:700;font-size:14px;flex:none}
.stp-dot{width:8px;height:8px;border-radius:50%;flex:none}
.stp-dot.idle{background:var(--dsw-alias-state-success-primary,#3fb27f)}
.stp-dot.summarizing{background:var(--dsw-alias-state-business-primary);animation:stp-pulse 1.2s ease-in-out infinite}
.stp-dot.error{background:var(--dsw-alias-state-error-primary)}
.stp-dot.loading{background:var(--dsw-alias-label-tertiary)}
@keyframes stp-pulse{50%{opacity:.35}}
.stp-backfill{display:flex;align-items:center;gap:8px;padding:6px 12px;border-bottom:.5px solid var(--dsw-alias-border-l1);color:var(--dsw-alias-label-secondary);font-size:12px}
.stp-backfillBtn{border:0;background:transparent;color:var(--dsw-alias-state-business-primary);cursor:pointer;padding:2px 6px;font-size:12px;border-radius:var(--dsw-radius-sm)}
.stp-backfillBtn:hover{background:var(--dsw-alias-interactive-bg-hover)}
.stp-list{flex:1;min-height:0;overflow-y:auto;padding:6px 8px}
.stp-row{position:relative;border-radius:var(--dsw-radius-md);padding:8px 10px 8px 12px;cursor:pointer;margin-bottom:4px}
.stp-row:hover{background:var(--dsw-alias-interactive-bg-hover)}
.stp-row.stp-viewing{background:var(--dsw-alias-interactive-bg-hover-solid)}
.stp-row.stp-active{box-shadow:inset 2px 0 0 var(--dsw-alias-state-business-primary)}
.stp-rowTop{display:flex;align-items:baseline;gap:8px}
.stp-rowTitle{flex:1;min-width:0;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.stp-rowTurns{flex:none;color:var(--dsw-alias-label-tertiary);font-size:11px;font-variant-numeric:tabular-nums}
.stp-rowSummary{color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px;margin-top:2px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.stp-row.stp-flash{animation:stp-rowflash 2.5s ease-out}
@keyframes stp-rowflash{0%{background:color-mix(in srgb,var(--dsw-alias-state-business-primary) 18%,transparent)}100%{background:transparent}}
.stp-rowActions{display:flex;gap:6px;margin-top:4px;opacity:0;transition:opacity .12s}
.stp-row:hover .stp-rowActions,.stp-row:focus-within .stp-rowActions{opacity:1}
.stp-rowBtn{border:.5px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-sm);background:var(--dsw-alias-button-floating-fill);color:var(--dsw-alias-label-secondary);padding:2px 8px;font-size:11px;cursor:pointer}
.stp-rowBtn:hover{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-interactive-bg-hover)}
.stp-empty{padding:32px 16px;text-align:center;color:var(--dsw-alias-label-tertiary)}
.stp-foot{flex:none;padding:8px 12px;border-top:.5px solid var(--dsw-alias-border-l1)}
.stp-latest{width:100%;height:30px;border:.5px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-sm);background:var(--dsw-alias-button-floating-fill);color:var(--dsw-alias-label-secondary);cursor:pointer;font-size:12px}
.stp-latest:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
.stp-toast{position:absolute;left:12px;right:12px;bottom:52px;background:var(--dsw-alias-bg-inverse,#2c2c2e);color:var(--dsw-alias-label-inverse,#fff);border-radius:var(--dsw-radius-md);padding:8px 12px;font-size:12px;box-shadow:var(--dsw-elevation-panel);pointer-events:none}
.stp-config{flex-direction:column;gap:6px;padding:8px 12px 10px;border-bottom:.5px solid var(--dsw-alias-border-l1)}
.stp-configTitle{font-weight:500;font-size:12px;color:var(--dsw-alias-label-secondary)}
.stp-configLabel{font-size:11px;color:var(--dsw-alias-label-tertiary)}
.stp-configHint{font-size:11px;color:var(--dsw-alias-label-tertiary)}
.stp-configSave{align-self:flex-start;border:.5px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-sm);background:var(--dsw-alias-button-floating-fill);color:var(--dsw-alias-label-primary);padding:4px 12px;font-size:12px;cursor:pointer}
.stp-configSave:hover{background:var(--dsw-alias-interactive-bg-hover)}
.stp-hit{border-radius:var(--dsw-radius-md);padding:8px 10px;margin-bottom:4px;cursor:pointer}
.stp-hit:hover{background:var(--dsw-alias-interactive-bg-hover)}
.stp-hitSession{color:var(--dsw-alias-label-tertiary);font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.stp-hitReason{color:var(--dsw-alias-state-business-primary);font-size:11px;margin-top:2px}
.stp-note{padding:4px 12px;color:var(--dsw-alias-label-tertiary);font-size:11px}
`;

		// ---------- components ----------

		function TopicRow({ topic, viewing, active, t, onJump, onContinue, now }) {
			const fresh = typeof now === "number" && typeof topic.updatedAt === "number" && now - topic.updatedAt < 15_000;
			return h(
				"div",
				{
					className: `stp-row${viewing ? " stp-viewing" : ""}${active ? " stp-active" : ""}${fresh ? " stp-flash" : ""}`,
					role: "button",
					tabIndex: 0,
					onClick: () => onJump(topic),
					onKeyDown: (event) => {
						if (event.key === "Enter" || event.key === " ") {
							event.preventDefault();
							onJump(topic);
						}
					},
				},
				h(
					"div",
					{ className: "stp-rowTop" },
					h("span", { className: "stp-rowTitle", title: topic.title }, topic.title),
					h(
						"span",
						{ className: "stp-rowTurns" },
						`${t("topic.turnsPrefix")}${topic.startTurn}–${topic.startTurn + Math.max(1, topic.turnCount) - 1}` +
							(typeof topic.updatedAt === "number" ? ` · ${formatRelative(topic.updatedAt, now ?? Date.now())}` : ""),
					),
				),
				topic.summary ? h("div", { className: "stp-rowSummary" }, topic.summary) : null,
				h(
					"div",
					{ className: "stp-rowActions" },
					h(
						"button",
						{
							className: "stp-rowBtn",
							type: "button",
							onClick: (event) => {
								event.stopPropagation();
								onContinue(topic);
							},
						},
						t("topic.continue"),
					),
				),
			);
		}

		function SearchHit({ hit, t, onOpen }) {
			return h(
				"div",
				{ className: "stp-hit", role: "button", tabIndex: 0, onClick: () => onOpen(hit) },
				h("div", { className: "stp-rowTop" }, h("span", { className: "stp-rowTitle" }, hit.topic.title)),
				hit.topic.summary ? h("div", { className: "stp-rowSummary" }, hit.topic.summary) : null,
				h("div", { className: "stp-hitSession" }, hit.sessionTitle),
				hit.reason ? h("div", { className: "stp-hitReason" }, `${t("search.reason")}: ${hit.reason}`) : null,
			);
		}

		/** Standalone entry: a floating drawer used when dsh-better-sidebar is absent. */
		function StandaloneTopics({ t, sessionId, open, onClose, appendDraft, loadThrough, openSessionAt }) {
			if (!open) return null;
			return h(
				"div",
				{ className: "stp-standaloneOverlay", onClick: onClose },
				h(
					"div",
					{ className: "stp-standalone", onClick: (event) => event.stopPropagation() },
					h(TopicsPanel, { t, sessionId, appendDraft, loadThrough, openSessionAt, dismiss: onClose }),
				),
			);
		}

		function TopicsPanel({ t, sessionId, appendDraft, loadThrough, openSessionAt, dismiss }) {
			const [topicList, setTopicList] = useState(null);
			const [phase, setPhase] = useState("loading");
			const [error, setError] = useState(null);
			const [backfill, setBackfill] = useState(null);
			const [query, setQuery] = useState("");
			const [scope, setScope] = useState("session");
			const [keywordResults, setKeywordResults] = useState(null);
			const [semanticResults, setSemanticResults] = useState(null);
			const [semanticBusy, setSemanticBusy] = useState(false);
			const [viewingTopicId, setViewingTopicId] = useState(null);
			const [toast, setToast] = useState(null);
			const toastTimer = useRef(null);
			const [configOpen, setConfigOpen] = useState(false);
			const [summarizer, setSummarizer] = useState(null);
			const [providerInput, setProviderInput] = useState("");
			const [modelInput, setModelInput] = useState("");
			const [modelCatalog, setModelCatalog] = useState(null);
			const [doneFlash, setDoneFlash] = useState(false);
			const prevPhase = useRef(null);
			const [now, setNow] = useState(() => Date.now());
			useEffect(() => {
				const timer = setInterval(() => setNow(Date.now()), 30_000);
				return () => clearInterval(timer);
			}, []);

			// flash a check mark for a few seconds after a run completes
			useEffect(() => {
				const was = prevPhase.current;
				prevPhase.current = phase;
				if (was === "summarizing" && phase === "idle") {
					setDoneFlash(true);
					const timer = setTimeout(() => setDoneFlash(false), 2500);
					return () => clearTimeout(timer);
				}
				return undefined;
			}, [phase]);

			const showToast = useCallback((text) => {
				setToast(text);
				if (toastTimer.current !== null) clearTimeout(toastTimer.current);
				toastTimer.current = setTimeout(() => setToast(null), 2600);
			}, []);

			const loadConfig = useCallback(() => {
				api("config")
					.then((data) => {
						setSummarizer(data.summarizer ?? null);
						setProviderInput(data.summarizer?.provider ?? "");
						setModelInput(data.summarizer?.model ?? "");
					})
					.catch(() => {});
				api("models")
					.then((data) => setModelCatalog(data.providers ?? []))
					.catch(() => setModelCatalog([]));
			}, []);

			// initial load + SSE subscription
			useEffect(() => {
				let disposed = false;
				if (sessionId == null) return undefined;
				const source = new EventSource(`${ROUTE}events?sessionId=${encodeURIComponent(sessionId)}`);
				source.onmessage = (event) => {
					if (disposed) return;
					try {
						const payload = JSON.parse(event.data);
						if (payload.kind === "topics" && payload.sessionId === sessionId) {
							setTopicList(payload.topicList);
						} else if (payload.kind === "status" && payload.sessionId === sessionId) {
							setPhase(payload.status.phase);
							setError(payload.status.error ?? null);
						} else if (payload.kind === "backfill") {
							setBackfill(payload.backfill);
						} else if (payload.kind === "config") {
							setSummarizer(payload.summarizer ?? null);
						}
					} catch {
						/* malformed frame */
					}
				};
				if (sessionId == null) return;
				api(`topics?sessionId=${encodeURIComponent(sessionId)}`)
					.then((data) => {
						if (disposed) return;
						setTopicList(data.topicList);
						setPhase(data.status?.phase ?? "idle");
						setError(data.status?.error ?? null);
					})
					.catch((err) => {
						if (disposed) return;
						setPhase("error");
						setError(String(err?.message ?? err));
					});
				return () => {
					disposed = true;
					source.close();
				};
			}, [sessionId]);

			// consume a pending cross-session jump once this session's list is live
			useEffect(() => {
				if (topicList === null) return;
				if (pendingJump.sessionId !== sessionId) return;
				const turn = pendingJump.turn;
				const seq = pendingJump.seq;
				pendingJump.sessionId = null;
				let cancelled = false;
				jumpToTopic({ startTurn: turn, startSeq: seq }, loadThrough).then((ok) => {
					if (!cancelled && !ok) showToast(t("jump.failed"));
				});
				return () => {
					cancelled = true;
				};
			}, [topicList, sessionId, showToast, t]);

			// debounced keyword search
			useEffect(() => {
				const text = query.trim();
				if (text.length === 0) {
					setKeywordResults(null);
					setSemanticResults(null);
					return;
				}
				const timer = setTimeout(() => {
					const suffix = scope === "session" ? `&sessionId=${encodeURIComponent(sessionId)}` : "";
					api(`search?q=${encodeURIComponent(text)}${suffix}`)
						.then((data) => setKeywordResults(data.results ?? []))
						.catch(() => setKeywordResults([]));
				}, 220);
				return () => clearTimeout(timer);
			}, [query, scope, sessionId]);

			const topics = topicList?.topics ?? [];

			const onJump = useCallback(
				(topic) => {
					setViewingTopicId(topic.id);
					jumpToTopic(topic, loadThrough).then((ok) => {
						if (!ok) showToast(t("jump.failed"));
					});
				},
				[loadThrough, showToast, t],
			);

			const onBackToLatest = useCallback(() => {
				setViewingTopicId(null);
				scrollToBottom();
			}, []);

			const onContinue = useCallback(
				(topic) => {
					const text = `${t("continue.prefix")}「${topic.title}」：${topic.summary}\n\n`;
					const injected = appendDraft?.(text);
					if (injected === true) {
						showToast(t("continue.ok"));
						return;
					}
					navigator.clipboard?.writeText(text).then(
						() => showToast(t("continue.fallback")),
						() => showToast(t("continue.fallback")),
					);
				},
				[appendDraft, showToast, t],
			);

			const onRefresh = useCallback(() => {
				post("refresh", { sessionId }).catch(() => showToast(t("status.error")));
			}, [sessionId, showToast, t]);

			const onResummarize = useCallback(() => {
				if (window.confirm(t("action.resummarize.confirm"))) {
					post("resummarize", { sessionId }).catch(() => showToast(t("status.error")));
				}
			}, [sessionId, showToast, t]);

			const onSemantic = useCallback(() => {
				const text = query.trim();
				if (text.length === 0 || semanticBusy) return;
				setSemanticBusy(true);
				post("semantic-search", { q: text })
					.then((data) => setSemanticResults(data.results ?? []))
					.catch(() => setSemanticResults([]))
					.finally(() => setSemanticBusy(false));
			}, [query, semanticBusy]);

			const onOpenHit = useCallback(
				(hit) => {
					if (hit.sessionId === sessionId) {
						const topic = topics.find((item) => item.id === hit.topic.id);
						if (topic !== undefined) onJump(topic);
						return;
					}
					pendingJump.sessionId = hit.sessionId;
					pendingJump.turn = hit.topic.startTurn;
					pendingJump.seq = hit.topic.startSeq;
					openSessionAt?.(hit.sessionId);
				},
				[sessionId, topics, onJump, openSessionAt],
			);

			const onBackfillControl = useCallback((action) => {
				post("backfill-control", { action }).catch(() => {});
			}, []);

			const onSaveConfig = useCallback(() => {
				post("config", { provider: providerInput.trim(), model: modelInput.trim() })
					.then((data) => {
						setSummarizer(data.summarizer ?? null);
						showToast(t("config.saved"));
					})
					.catch(() => showToast(t("status.error")));
			}, [providerInput, modelInput, showToast, t]);

			const searching = query.trim().length > 0;
			const results = semanticResults ?? keywordResults;
			const dotClass = phase === "summarizing" ? "summarizing" : phase === "error" ? "error" : phase === "loading" ? "loading" : "idle";
			const backfillLive =
				backfill !== null && backfill.active && backfill.total > 0 && backfill.done < backfill.total;

			const listContent = useMemo(() => {
				if (searching) {
					if (results === null) {
						return h("div", { className: "stp-empty" }, "…");
					}
					if (results.length === 0) {
						return h("div", { className: "stp-empty" }, semanticResults !== null ? t("search.semanticEmpty") : t("search.empty"));
					}
					return h(
						"div",
						null,
						h(
							"div",
							{ className: "stp-note" },
							`${t("search.hitsPrefix")} ${results.length} ${t("search.hitsSuffix")}`,
						),
						results.map((hit) =>
							h(SearchHit, { key: `${hit.sessionId}:${hit.topic.id}`, hit, t, onOpen: onOpenHit }),
						),
					);
				}
				if (phase === "loading" && topicList === null) {
					return h("div", { className: "stp-empty" }, t("status.loading"));
				}
				if (topics.length === 0) {
					return h("div", { className: "stp-empty" }, t("empty.noTopics"));
				}
				return topics.map((topic) =>
					h(TopicRow, {
						key: topic.id,
						topic,
						t,
						now,
						active: topic.status === "active",
						viewing: viewingTopicId === topic.id,
						onJump,
						onContinue,
					}),
				);
			}, [searching, results, semanticResults, t, phase, topicList, topics, viewingTopicId, now, onJump, onContinue, onOpenHit]);

			return h(
				"div",
				{ className: "stp-root" },
				h("style", null, CSS),
				h(
					"div",
					{ className: "stp-search" },
					h("input", {
						className: "stp-input",
						type: "search",
						placeholder: t("search.placeholder"),
						value: query,
						onChange: (event) => {
							setQuery(event.target.value);
							setSemanticResults(null);
						},
						onKeyDown: (event) => {
							if (event.key === "Enter") {
								event.preventDefault();
								onSemantic();
							}
						},
					}),
					h(
						"div",
						{ className: "stp-scope", role: "group" },
						h(
							"button",
							{
								type: "button",
								className: scope === "session" ? "stp-on" : "",
								onClick: () => setScope("session"),
							},
							t("search.scope.session"),
						),
						h(
							"button",
							{
								type: "button",
								className: scope === "global" ? "stp-on" : "",
								onClick: () => setScope("global"),
							},
							t("search.scope.global"),
						),
					),
					h(
						"button",
						{
							className: "stp-semantic",
							type: "button",
							disabled: semanticBusy || query.trim().length === 0,
							onClick: onSemantic,
							title: t("search.semantic"),
						},
						semanticBusy ? t("search.semanticBusy") : t("search.semantic"),
					),
				),
				h(
					"div",
					{ className: "stp-head" },
					h("span", { className: "stp-headTitle" }, t("header.title")),
					dismiss === undefined
						? null
						: h(
								"button",
								{ className: "stp-headBtn", type: "button", title: t("header.close"), onClick: dismiss },
								"✕",
							),
					h("button", { className: "stp-headBtn", type: "button", onClick: onRefresh }, t("action.refresh")),
					h("button", { className: "stp-headBtn", type: "button", onClick: onResummarize }, t("action.resummarize")),
					h(
						"span",
						{
							className: "stp-statusIcon",
							title: phase === "error" ? `${t("status.error")}: ${error ?? ""}` : t(`status.${phase}`),
						},
						phase === "summarizing"
							? h("span", { className: "stp-spinner", "aria-label": t("status.summarizing") })
							: phase === "error"
								? h("span", { className: "stp-dot error" })
								: doneFlash
									? h("span", { className: "stp-check", "aria-label": t("status.idle") }, "✓")
									: null,
					),
					h(
						"button",
						{
							className: "stp-headBtn",
							type: "button",
							title: t("config.title"),
							onClick: () => {
								setConfigOpen((open) => !open);
								if (summarizer === null) loadConfig();
							},
						},
						"⚙",
					),
				),
				configOpen
					? h(
							"div",
							{ className: "stp-config" },
							h(
								"div",
								{ className: "stp-configTitle" },
								`${t("config.title")}${summarizer !== null ? `: ${summarizer.provider} / ${summarizer.model}` : ""}`,
							),
							h("label", { className: "stp-configLabel" }, t("config.provider")),
							h(
								"select",
								{
									className: "stp-input",
									value: providerInput,
									onChange: (event) => {
										setProviderInput(event.target.value);
										setModelInput("");
									},
								},
								h("option", { value: "" }, "—"),
								(modelCatalog ?? []).map((entry) =>
									h("option", { key: entry.provider, value: entry.provider }, entry.name ?? entry.provider),
								),
							),
							h("label", { className: "stp-configLabel" }, t("config.model")),
							h(
								"select",
								{
									className: "stp-input",
									value: modelInput,
									onChange: (event) => setModelInput(event.target.value),
								},
								h("option", { value: "" }, "—"),
								(modelCatalog ?? [])
									.find((entry) => entry.provider === providerInput)
									?.models.map((model) => h("option", { key: model.id, value: model.id }, model.name ?? model.id)) ?? [],
							),
							h("div", { className: "stp-configHint" }, t("config.hint")),
							h(
								"button",
								{
									className: "stp-configSave",
									type: "button",
									disabled: providerInput.length === 0 || modelInput.length === 0,
									onClick: onSaveConfig,
								},
								t("config.save"),
							),
						)
					: null,
				backfillLive
					? h(
							"div",
							{ className: "stp-backfill" },
							h(
								"span",
								null,
								`${backfill.paused ? t("backfill.pausedPrefix") : t("backfill.prefix")} ${backfill.done}/${backfill.total}`,
							),
							h(
								"button",
								{
									className: "stp-backfillBtn",
									type: "button",
									onClick: () => onBackfillControl(backfill.paused ? "resume" : "pause"),
								},
								backfill.paused ? t("backfill.resume") : t("backfill.pause"),
							),
						)
					: null,
				h("div", { className: "stp-list" }, listContent),
				h(
					"div",
					{ className: "stp-foot" },
					h("button", { className: "stp-latest", type: "button", onClick: onBackToLatest }, `↓ ${t("backToLatest")}`),
				),
				toast !== null ? h("div", { className: "stp-toast" }, toast) : null,
			);
		}

		return {
			inject: ["locale", "sessions", "uiWorkspace"],
			apply(ctx) {
				const t = ctx.locale.bind(NS);
				ctx.effect(() => ctx.locale.register(NS, dictionaries), "session-topics: dictionaries");

				
				/** Inject a continuation draft into the session's composer. */
				const appendDraft = (sessionId, text) => {
					try {
						const actx = ctx.sessions.scope(sessionId);
						const conversation = actx?.get("conversation");
						const shell = conversation?.input?.shell(sessionId);
						if (shell === undefined) return false;
						shell.setDraft(text);
						return true;
					} catch {
						return false;
					}
				};
				/** Fetch the transcript page containing `seq` — the same call the built-in turn navigator makes. */
				const loadThrough = async (sessionId, seq) => {
					try {
						const binding = ctx.sessions.binding(sessionId);
						if (binding === undefined) return false;
						await binding.session.loadThrough(seq);
						return true;
					} catch {
						return false;
					}
				};
				const openSessionAt = (sessionId) => {
					try {
						ctx.uiWorkspace.openSession(sessionId);
					} catch {
						/* navigation unavailable */
					}
				};

				// Register as a dsh-better-sidebar page: no auto-open (the user opens it
				// from the sidebar's + menu or guide), single instance per sidebar.
				let betterSidebar;
				try {
					betterSidebar = ctx.get("betterSidebar");
				} catch {
					betterSidebar = undefined;
				}
				{
					// Always mount a floating entry button, whether or not the sidebar
					// registers a tab: the button is the plugin's own entry, the tab is
					// only one host surface that may come and go with the sidebar.
					const host = document.createElement("div");
					const mount = () => {
						if (typeof document === "undefined" || !document.body) return;
						if (!host.isConnected) document.body.appendChild(host);
					};
					mount();
					const mountTimer = setInterval(mount, 1000);
					const root = createRoot(host);
					const App = () => {
						const [open, setOpen] = useState(false);
						const [sessionId, setSessionId] = useState(null);
						useEffect(() => {
							const read = () => {
								const match = location.hash.match(/session[-/]([0-9a-f-]{8,})/i);
								setSessionId(match === null ? null : match[1]);
							};
							read();
							const timer = setInterval(read, 2000);
							window.addEventListener("hashchange", read);
							return () => {
								clearInterval(timer);
								window.removeEventListener("hashchange", read);
							};
						}, []);
						// The button stays reachable even before a session id is known:
						// the panel itself resolves the session lazily, and hiding the
						// entry on first paint made it look like the plugin had none.
						return h(
							React.Fragment,
							null,
							h(
								"button",
								{ className: "stp-fab", type: "button", onClick: () => setOpen(true) },
								t("open.button"),
							),
							h(StandaloneTopics, {
								t,
								sessionId,
								open,
								onClose: () => setOpen(false),
								appendDraft: (text) => appendDraft(sessionId, text),
								loadThrough: (seq) => loadThrough(sessionId, seq),
								openSessionAt,
							}),
						);
					};
					root.render(h(App));
					ctx.effect(
						() => () => {
							clearInterval(mountTimer);
							root.unmount();
							host.remove();
						},
						"session-topics: standalone entry",
					);
				}

				if (betterSidebar === undefined) {
					// No sidebar service: the floating button above is the only entry.
					return;
				}

				ctx.effect(
					() =>
						betterSidebar.registerTab({
							id: "session-topics",
							title: () => t("tab.title"),
							description: () => t("tab.description"),
							icon: (size) =>
								h(
									"svg",
									{ width: size, height: size, viewBox: "0 0 64 64", "aria-hidden": "true", fill: "none" },
									h("rect", { x: "12", y: "8", width: "40", height: "48", rx: "9", stroke: "currentColor", "stroke-width": "6" }),
									h("circle", { cx: "23", cy: "22", r: "4", fill: "currentColor" }),
									h("rect", { x: "31", y: "19", width: "14", height: "6", rx: "3", fill: "currentColor" }),
									h("circle", { cx: "23", cy: "34", r: "4", fill: "currentColor" }),
									h("rect", { x: "31", y: "31", width: "14", height: "6", rx: "3", fill: "currentColor" }),
								),
							single: true,
							component: ({ scope }) =>
								h(TopicsPanel, {
									t,
									sessionId: scope.sessionId,
									appendDraft: (text) => appendDraft(scope.sessionId, text),
									loadThrough: (seq) => loadThrough(scope.sessionId, seq),
									openSessionAt,
								}),
						}),
					"session-topics: better-sidebar tab",
				);
			},
		};
	},
});
