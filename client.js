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
		const ReactDOM = require("react-dom");
		const createPortal = ReactDOM.createPortal;
		const { useState, useEffect, useMemo, useRef, useCallback, useSyncExternalStore } = React;
		const h = React.createElement;

		const NS = "sessionTopics";
		const ROUTE = "/plugins/session-topics/";

		const dictionaries = {
			zh: {
				"tab.title": "主题",
			"tab.description": "本会话的主题导航：LLM 整理的主题列表，点击跳转、继续讨论",
				"rail.openPanel": "展开主题面板",
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
				"rail.openPanel": "Open the topics panel",
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
.stp-toolBtn{display:inline-flex;align-items:center;gap:4px;flex:none;height:auto;padding:2px 4px;margin:0 2px;border:0;border-radius:4px;background:none;box-shadow:none;color:var(--dsw-alias-label-secondary);font-size:13px;font-weight:500;font-family:var(--dsw-font-family,inherit);letter-spacing:0;line-height:1.4;white-space:nowrap;cursor:pointer;transition:color .12s ease;-webkit-appearance:none;appearance:none}
.stp-toolBtn:hover{background:none;color:var(--dsw-alias-label-primary)}
.stp-toolBtn[data-active="true"],.stp-toolBtn[data-active="true"]:hover{background:none;color:var(--dsw-alias-state-business-primary,#4176e6)}
.stp-toolBtn:focus-visible{outline:1px solid var(--dsw-alias-state-business-primary,#4176e6);outline-offset:1px}
.stp-toolIcon{display:inline-flex;align-items:center;flex:none;width:16px;height:16px}
.stp-toolLabel{display:inline-block}

/* ---------- topic rail (right edge) ---------- */
.str-frame{position:absolute;top:0;right:12px;z-index:7;display:flex;flex-direction:column;align-items:flex-end;gap:6px;width:28px;pointer-events:none;height:calc(var(--dsh-conversation-viewport-height,100dvh) - var(--dsh-composer-height,152px));top:calc(var(--dsh-conversation-viewport-height,100dvh) / 2 - var(--dsh-composer-height,152px) / 2);transform:translateY(-50%);max-height:min(max(0px, calc(var(--dsh-conversation-viewport-height,100dvh) - var(--dsh-composer-height,152px) - 64px)), 420px)}
.str-scroller{max-height:100%;overflow-y:auto;scrollbar-width:none;position:relative;pointer-events:auto}
.str-scroller::-webkit-scrollbar{display:none}
.str-marks{position:relative;width:28px}
.str-mark{cursor:pointer;background:0 0;border:0;border-radius:8px;height:10px;padding:0;position:absolute;top:0;left:0;right:0}
.str-bar{display:block;width:20px;height:2px;border-radius:2px;background:var(--dsw-alias-border-l4);margin-left:auto;transform:scaleX(.6);transform-origin:100%;transition:transform .14s,background-color .14s}
.str-mark:hover .str-bar,.str-markPreview .str-bar{background:var(--dsw-alias-label-tertiary);transform:scaleX(.9)}
.str-markActive .str-bar{background:var(--dsw-alias-label-primary);transform:scaleX(1)}
.str-markBusy .str-bar{animation:str-pulse 1s ease-in-out infinite}
.str-mark:focus-visible{outline:none}
.str-mark:focus-visible .str-bar{background:var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));transform:scaleX(1)}
@keyframes str-pulse{0%,to{opacity:1}50%{opacity:.35}}
.str-preview{position:absolute;right:calc(100% + 10px);width:min(300px,100cqw - 120px);box-sizing:border-box;border-radius:var(--dsw-radius-lg);background:var(--dsw-alias-bg-layer-1);box-shadow:var(--dsw-elevation-panel);border:0;padding:10px 12px;pointer-events:none;overflow:hidden;animation:str-preview-in .12s ease-out}
.str-previewTitle{font:var(--dsw-font-xs-strong-13);color:var(--dsw-alias-label-primary);display:-webkit-box;-webkit-line-clamp:1;-webkit-box-orient:vertical;overflow:hidden}
.str-previewBody{font:var(--dsw-font-xxs-12);color:var(--dsw-alias-label-caption);display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;margin-top:4px}
.str-previewMeta{font:var(--dsw-font-xxs-12);color:var(--dsw-alias-label-tertiary);margin-top:4px}
@keyframes str-preview-in{0%{opacity:0;transform:translate(4px)}to{opacity:1;transform:translate(0)}}
.str-open{pointer-events:auto;flex:none;width:24px;height:24px;display:inline-flex;align-items:center;justify-content:center;border:0;border-radius:6px;background:0 0;color:var(--dsw-alias-label-tertiary);cursor:pointer;transition:color .12s,background .12s}
.str-open:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-secondary)}
@media (container-width<=900px){.str-frame{display:none}}
@media (prefers-reduced-motion:reduce){.str-mark,.str-bar,.str-preview{transition:none;animation:none}}

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

		/** Shared list glyph for the sidebar tab and the composer-dock entry. */
				// DSH native `list-pen-outline` (viewBox 0 0 16 16), used by the shell's own
		// list-ish icons so this entry matches the other composer buttons.
		function IconTopics(size) {
			return h(
				"svg",
				{ width: size, height: size, viewBox: "0 0 16 16", "aria-hidden": "true", fill: "none", style: { display: "block", flex: "none" } },
				h("path", { d: "M4.9375 5.90295H11.0625", stroke: "currentColor", "stroke-width": "1.2", "stroke-linecap": "round" }),
				h("path", { d: "M4.9375 9.02991H8.27841", stroke: "currentColor", "stroke-width": "1.2", "stroke-linecap": "round" }),
				h("path", { d: "M12.5 1.32617C13.3039 1.32617 14 1.95171 14 2.77637V7.61328L13 8.68164V2.77637C13 2.55186 12.8007 2.32617 12.5 2.32617H3.5C3.1993 2.32617 3 2.55186 3 2.77637V13.2246C3.00044 13.4489 3.19963 13.6738 3.5 13.6738H8.32812L7.39258 14.6738H3.5C2.69637 14.6738 2.00042 14.0489 2 13.2246V2.77637C2 1.95171 2.69613 1.32617 3.5 1.32617H12.5Z", fill: "currentColor" }),
				h("path", { d: "M8.97212 14.3693C9.17511 14.5723 9.37811 14.7753 9.5811 14.9783C9.67012 14.8953 9.75914 14.8123 9.84815 14.7293C11.4505 13.2352 13.0528 11.7411 14.6551 10.247C14.7441 10.164 14.8331 10.081 14.9221 9.99803C14.5989 9.6748 14.2756 9.35157 13.9524 9.02834C13.8694 9.11736 13.7864 9.20637 13.7034 9.29539C12.2093 10.8977 10.7152 12.5 9.22113 14.1023C9.13813 14.1913 9.05513 14.2803 8.97212 14.3693Z", fill: "currentColor" }),
				h("path", { d: "M11.6323 13.7841C11.6323 14.0395 11.6323 14.295 11.6323 14.5504C11.6812 14.5523 11.7301 14.5543 11.779 14.5562C12.659 14.5913 13.539 14.6263 14.419 14.6614C14.4679 14.6633 14.5168 14.6653 14.5657 14.6672C14.5657 14.3339 14.5657 14.0006 14.5657 13.6672C14.5168 13.6692 14.4679 13.6711 14.419 13.6731C13.539 13.7081 12.659 13.7432 11.779 13.7783C11.7301 13.7802 11.6812 13.7821 11.6323 13.7841Z", fill: "currentColor" }),
			);
		}

		/**
		 * Composer-dock entry: a full-width row under the input card (same seat as the
		 * PUA / goal docks). Expanded, it renders the panel inline inside the dock
		 * instead of an overlay — an overlay on the shell root cannot be scoped, and
		 * its scrollbar leaks onto the whole window.
		 */
		/**
		 * Composer tool-row entry: one compact button next to PUA in
		 * `conversation.input.left`. Clicking it opens the sidebar's "session-topics"
		 * tab — all content lives in the DSH right sidebar, nothing renders here.
		 */
		function ToolRowEntry({ t, toggle, useOpenFlag }) {
			const isOpen = useOpenFlag();
			// Inline styles on purpose: the shell's base `button` rule paints a border
			// and a surface, and beats any plugin class with ordinary specificity.
			const style = {
				display: "inline-flex",
				alignItems: "center",
				gap: "4px",
				flex: "none",
				width: "auto",
				height: "auto",
				minHeight: "0",
				minWidth: "0",
				padding: "2px 2px 2px 0",
				margin: "0",
				border: "0 none",
				borderRadius: "0",
				background: "none",
				backgroundColor: "transparent",
				boxShadow: "none",
				outline: "none",
				color: isOpen
					? "var(--dsw-alias-state-business-primary, #4176e6)"
					: "var(--dsw-alias-label-secondary)",
				font: "inherit",
				fontSize: "13px",
				fontWeight: "500",
				lineHeight: "1.4",
				whiteSpace: "nowrap",
				cursor: "pointer",
				appearance: "none",
				WebkitAppearance: "none",
			};
			return h(
				"button",
				{
					type: "button",
					style,
					title: t("tab.title"),
					"aria-label": t("tab.title"),
					"aria-pressed": isOpen,
					onMouseEnter: (event) => {
						event.currentTarget.style.color = isOpen
							? "var(--dsw-alias-state-business-primary, #4176e6)"
							: "var(--dsw-alias-label-primary)";
					},
					onMouseLeave: (event) => {
						event.currentTarget.style.color = isOpen
							? "var(--dsw-alias-state-business-primary, #4176e6)"
							: "var(--dsw-alias-label-secondary)";
					},
					onClick: () => toggle(),
				},
				h(
					"span",
					{
						style: {
							display: "inline-flex",
							alignItems: "center",
							justifyContent: "center",
							flex: "none",
							width: "16px",
							height: "16px",
							overflow: "visible",
						},
						"aria-hidden": true,
					},
					IconTopics(16),
				),
				h(
					"span",
					{ style: { display: "inline-block", lineHeight: "1.4" } },
					t("tab.title"),
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

		/**
		 * Mount children into the conversation scroll surface. The view slot renders
		 * inside the transcript column, but the rail has to sit on the surface's right
		 * edge — the same ancestor the native turn navigator positions against.
		 */
		function RailPortal({ children }) {
			const [host, setHost] = useState(null);
			useEffect(() => {
				const find = () => document.querySelector("[data-conversation-scroll]");
				const initial = find();
				if (initial !== null) {
					setHost(initial);
					return undefined;
				}
				let tries = 0;
				const timer = setInterval(() => {
					tries += 1;
					const element = find();
					if (element !== null) {
						setHost(element);
						clearInterval(timer);
					} else if (tries > 40) {
						clearInterval(timer);
					}
				}, 250);
				return () => clearInterval(timer);
			}, []);
			if (host === null) return null;
			return createPortal(children, host);
		}

		/**
		 * Rail host: owns the topic feed for the rail. The side card gets its data
		 * from `TopicsPanel`'s own subscription; the rail is a separate mount and
		 * must not depend on the panel being alive.
		 */
		function RailHost({ t, sessionId, loadThrough, openPanel, useOpenFlag }) {
			const sideCardOpen = useOpenFlag();
			const [topics, setTopics] = useState(null);
			const [phase, setPhase] = useState("idle");

			useEffect(() => {
				if (sessionId == null) return undefined;
				let disposed = false;
				const source = new EventSource(`${ROUTE}events?sessionId=${encodeURIComponent(sessionId)}`);
				source.onmessage = (event) => {
					if (disposed) return;
					try {
						const payload = JSON.parse(event.data);
						if (payload.kind === "topics" && payload.sessionId === sessionId) {
							setTopics(payload.topicList?.topics ?? []);
						} else if (payload.kind === "status" && payload.sessionId === sessionId) {
							setPhase(payload.status?.phase ?? "idle");
						}
					} catch {
						/* ignore malformed frames */
					}
				};
				source.onerror = () => {
					/* EventSource reconnects on its own */
				};
				api(`topics?sessionId=${encodeURIComponent(sessionId)}`)
					.then((data) => {
						if (!disposed) setTopics(data?.topics ?? []);
					})
					.catch(() => {});
				return () => {
					disposed = true;
					source.close();
				};
			}, [sessionId]);

			return h(TopicRail, {
				t,
				sessionId,
				topics,
				phase,
				loadThrough: typeof loadThrough === "function" ? (seq) => loadThrough(sessionId, seq) : undefined,
				onOpenPanel: openPanel,
				hidden: sideCardOpen,
			});
		}

		// ---------- topic rail ----------
		//
		// A slim always-on rail on the right edge of the transcript, mirroring the
		// shell's own turn navigator (`TurnNavigator` in dsh-client-ui-chat): one
		// short mark per topic, a hover/focus preview card that opens to the left,
		// and click-to-jump. It is deliberately NOT the side card: the rail shows
		// where you are, the side card shows what each topic said. They are
		// mutually exclusive — whichever opens hides the other.

		const RAIL_MARK_PX = 10; // mark slot height, same rhythm as the native rail
		const RAIL_INSET_PX = 6;
		const RAIL_FADE_PX = 24;

		/** Clip a string to `limit` characters, appending an ellipsis when it was cut. */
		function clip(text, limit) {
			const value = String(text ?? "").replace(/\s+/g, " ").trim();
			return value.length > limit ? `${value.slice(0, limit - 1).trimEnd()}…` : value;
		}

		function TopicRail({ t, sessionId, topics, phase, loadThrough, onOpenPanel, hidden }) {
			const [previewId, setPreviewId] = useState(null);
			const [activeId, setActiveId] = useState(null);
			const scrollerRef = useRef(null);

			const items = useMemo(() => {
				const list = Array.isArray(topics) ? topics : [];
				return list.map((topic, index) => ({
					topic,
					index,
					title: clip(topic.title, 24),
					preview: clip(topic.summary || topic.title, 120),
				}));
			}, [topics]);

			const busy = phase === "summarizing";
			const total = items.length;

			// Follow the transcript: the topic whose turn range covers the turn at the
			// top of the viewport is "where you are".
			useEffect(() => {
				if (total === 0) return undefined;
				let frame = null;
				const measure = () => {
					frame = null;
					const scroller = chatScroller();
					if (scroller === null) return;
					const rows = scroller.querySelectorAll("[data-chat-turn]:not([hidden])");
					const top = scroller.getBoundingClientRect().top;
					let current = null;
					for (const row of rows) {
						if (row.getBoundingClientRect().bottom < top + 8) continue;
						const value = Number(row.getAttribute("data-chat-turn"));
						if (Number.isSafeInteger(value)) current = value;
						break;
					}
					if (current === null) return;
					let match = null;
					for (const item of items) {
						const start = item.topic.startTurn;
						const span = Math.max(1, item.topic.turnCount || 1);
						if (current >= start && current < start + span) {
							match = item.topic.id;
							break;
						}
						if (current >= start) match = item.topic.id;
					}
					setActiveId(match);
				};
				const onScroll = () => {
					if (frame !== null) return;
					frame = requestAnimationFrame(measure);
				};
				measure();
				const scroller = chatScroller();
				scroller?.addEventListener("scroll", onScroll, { passive: true });
				window.addEventListener("resize", onScroll);
				return () => {
					if (frame !== null) cancelAnimationFrame(frame);
					scroller?.removeEventListener("scroll", onScroll);
					window.removeEventListener("resize", onScroll);
				};
			}, [items, total]);

			// Keep the active mark inside the rail's scroll window.
			useEffect(() => {
				const scroller = scrollerRef.current;
				if (scroller === null || activeId == null) return;
				const index = items.findIndex((item) => item.topic.id === activeId);
				if (index < 0) return;
				const top = RAIL_INSET_PX + index * RAIL_MARK_PX;
				const view = scroller.clientHeight;
				if (view === 0) return;
				if (top < scroller.scrollTop + RAIL_FADE_PX) {
					scroller.scrollTo({ top: Math.max(0, top - RAIL_FADE_PX) });
				} else if (top + RAIL_MARK_PX > scroller.scrollTop + view - RAIL_FADE_PX) {
					scroller.scrollTo({ top: top + RAIL_MARK_PX - view + RAIL_FADE_PX });
				}
			}, [activeId, items]);

			if (hidden || total === 0) return null;

			const previewItem = previewId == null ? null : items.find((item) => item.topic.id === previewId);
			const previewIndex = previewItem === undefined ? -1 : items.indexOf(previewItem);
			const previewTop =
				previewIndex < 0 ? 0 : RAIL_INSET_PX + previewIndex * RAIL_MARK_PX + RAIL_MARK_PX / 2;

			return h(
				"div",
				{ className: "str-frame" },
				previewItem ? (
					h(
						"div",
						{ className: "str-preview", style: { top: `${previewTop}px` } },
						h("div", { className: "str-previewTitle" }, previewItem.topic.title),
						previewItem.topic.summary
							? h("div", { className: "str-previewBody" }, previewItem.topic.summary)
							: null,
						h(
							"div",
							{ className: "str-previewMeta" },
							`${t("topic.turnsPrefix")}${previewItem.topic.startTurn}–${previewItem.topic.startTurn + Math.max(1, previewItem.topic.turnCount || 1) - 1}`,
						),
					)
				) : null,
				h(
					"div",
					{ className: "str-scroller", ref: scrollerRef },
					h(
						"div",
						{ className: "str-marks", style: { height: `${RAIL_INSET_PX * 2 + total * RAIL_MARK_PX}px` } },
						items.map((item) =>
							h(
								"button",
								{
									key: item.topic.id,
									type: "button",
									className:
										"str-mark" +
										(item.topic.id === activeId ? " str-markActive" : "") +
										(item.topic.id === previewId ? " str-markPreview" : "") +
										(busy && item.index === total - 1 ? " str-markBusy" : ""),
									style: { top: `${RAIL_INSET_PX + item.index * RAIL_MARK_PX}px` },
									title: item.topic.title,
									"aria-label": item.topic.title,
									onPointerEnter: () => setPreviewId(item.topic.id),
									onPointerLeave: () => setPreviewId(null),
									onFocus: () => setPreviewId(item.topic.id),
									onBlur: () => setPreviewId(null),
									onClick: () => {
										jumpToTopic(item.topic, loadThrough).catch(() => {});
									},
								},
								h("span", { className: "str-bar" }),
							),
						),
					),
				),
				h(
					"button",
					{
						type: "button",
						className: "str-open",
						title: t("rail.openPanel"),
						"aria-label": t("rail.openPanel"),
						onClick: onOpenPanel,
					},
					IconTopics(14),
				),
			);
		}

		return {
			inject: ["locale", "sessions", "uiWorkspace", "slots", "layout"],
			apply(ctx) {
				const t = ctx.locale.bind(NS);
				ctx.effect(() => ctx.locale.register(NS, dictionaries), "session-topics: dictionaries");

				/**
				 * The session the user is looking at. Tracked from the tool-row slot's
				 * owner props, because openTab needs a scope and the plugin no longer
				 * parses the URL hash.
				 */
				let focusedSessionId;
				const currentSessionId = () => focusedSessionId;

				/**
				 * Whether our tab is open in the side card. Mirrors the real sidebar
				 * state so the tool-row button can render as pressed / unpressed.
				 */
				const openListeners = new Set();
				let openValue = false;
				const openFlagStore = {
					subscribe: (listener) => {
						openListeners.add(listener);
						return () => openListeners.delete(listener);
					},
					getSnapshot: () => openValue,
				};
				const setOpenFlag = (next) => {
					if (next === openValue) return;
					openValue = next;
					for (const listener of [...openListeners]) {
						try {
							listener();
						} catch {
							/* listener detached */
						}
					}
				};
				const useOpenFlag = () => useSyncExternalStore(openFlagStore.subscribe, openFlagStore.getSnapshot, () => false);

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
				// The plugin's own entry is ONE compact button in the composer tool row,
				// right next to PUA (`conversation.input.left`). It only opens the sidebar
				// tab — every piece of content lives in the sidebar, nothing renders here.
				const TOPICS_TYPE = "session-topics";

				/** The host right-sidebar controller, when this build provides one. */
				const sidebarRightService = () => {
					try {
						return ctx.get("sidebarRight");
					} catch {
						return undefined;
					}
				};

				/**
				 * Whether our tab is open — answered by the HOST right sidebar, not by
				 * better-sidebar's own bookkeeping.
				 *
				 * `service.getTab(id)` returns the registered DESCRIPTOR (`{id, single:
				 * true}`), not an open tab, so it is truthy forever and cannot be used as
				 * an is-open test. Once a native right sidebar exists, better-sidebar
				 * proxies `openTab` straight to `ctx.sidebarRight` and never writes its own
				 * store, so `bottomSplits` stays empty too. `sidebarRight.tabsIn(sessionId)`
				 * reads the real dock layout and is the one reliable source.
				 */
				const topicsTabInSidebar = () => {
					const sidebar = sidebarRightService();
					if (sidebar === undefined) return undefined;
					try {
						const tabs = sidebar.tabsIn?.(currentSessionId());
						if (!Array.isArray(tabs)) return undefined;
						return tabs.find((tab) => tab?.kind === TOPICS_TYPE);
					} catch {
						return undefined;
					}
				};
				const isTopicsTabOpen = () => topicsTabInSidebar() !== undefined;

				/** One click toggles: open the side card, or close it when it is already up. */
				const toggleTopics = () => {
					const sid = currentSessionId();
					try {
						if (isTopicsTabOpen()) {
							const tab = topicsTabInSidebar();
							betterSidebar?.closeTab?.(tab?.id ?? TOPICS_TYPE, { sessionId: sid });
						} else {
							betterSidebar?.openTab?.({ type: TOPICS_TYPE, reveal: true }, { sessionId: sid });
						}
					} catch {
						/* sidebar unavailable */
					}
					setOpenFlag(isTopicsTabOpen());
				};

				// The right-edge rail: mounted once per session view, hidden while the
				// side card is open so the two entry points never fight for the edge.
				ctx.slots.inject("conversation.view", () =>
					ctx.slots.register(
						{
							name: "conversation.view",
							id: "session-topics-rail",
							order: 40,
						},
						(props) => {
							const sid = props?.session?.sessionId ?? props?.sessionId ?? currentSessionId();
							// A view slot renders inline in the transcript column, where an
							// absolutely-positioned rail would land in the flow. Portal it into
							// the scroll surface itself, which is the only positioned ancestor
							// the native rail also uses.
							return h(RailPortal, {
								children: h(RailHost, {
									t,
									sessionId: sid,
									loadThrough,
									openPanel: () => {
										const target = currentSessionId();
										try {
											betterSidebar?.openTab?.({ type: TOPICS_TYPE, reveal: true }, { sessionId: target });
										} catch {
											/* sidebar unavailable */
										}
										setOpenFlag(isTopicsTabOpen());
									},
									useOpenFlag,
								}),
							});
						},
					),
				);

				ctx.slots.inject("conversation.input.left", () =>
					ctx.slots.register(
						{
							name: "conversation.input.left",
							id: "session-topics",
							order: 20,
						},
						(props) => {
							const sid = props?.session?.sessionId ?? props?.sessionId;
							if (sid != null) focusedSessionId = sid;
							return h(ToolRowEntry, { t, toggle: toggleTopics, useOpenFlag });
						},
					),
				);

				if (betterSidebar === undefined) {
					// No sidebar service: the tool-row button above is the only entry and
					// it degrades to opening the host's native right sidebar.
					return;
				}

				// Keep the button's pressed state in sync with the real side card, so a
				// tab closed from the sidebar also un-presses the button.
				try {
					ctx.effect(
						() =>
							betterSidebar.subscribeState?.(() => {
								setOpenFlag(isTopicsTabOpen());
							}),
						"session-topics: sidebar state",
					);
				} catch {
					/* subscription is best-effort */
				}

				ctx.effect(
					() =>
						betterSidebar.registerTab({
							id: "session-topics",
							title: () => t("tab.title"),
							description: () => t("tab.description"),
							icon: (size) => IconTopics(size),
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
