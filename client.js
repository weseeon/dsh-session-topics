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
// TEMP DIAGNOSTIC: boot-chain probes (module-eval → apply → turntail-first-fire).
// Remove once the restart-blank-rail mystery is solved.
try {
	fetch("/plugins/session-topics/rail-mount", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ stage: "module-eval", at: Date.now(), href: String(window.location?.href ?? "") }),
	}).catch(() => {});
} catch { /* diagnostics only */ }
window.__ModuleLoader__.load({
	id: "dsh-session-topics",
	factory(require) {
		const React = require("react");
		const { useState, useEffect, useMemo, useRef, useCallback, useSyncExternalStore } = React;
		const h = React.createElement;

		const NS = "sessionTopics";
		const ROUTE = "/plugins/session-topics/";

		const dictionaries = {
			zh: {
				"tab.title": "主题",
			"tab.description": "本会话的主题导航：LLM 整理的主题列表，点击跳转、继续讨论",
				"rail.openPanel": "展开主题面板",
				"rail.backToLatest": "回到最新",
				"settings.title": "会话主题",
				"settings.desc": "会话右侧的主题刻度条，以及按主题浏览整段对话的侧栏面板",
				"settings.enableRail": "显示主题刻度条",
				"settings.enableRail.desc": "替换 DSH 会话右侧的原生刻度条：按主题重新分段，悬停展开胶囊显示主题名，点击跳到该主题开头。关闭后恢复原生刻度条。",
				"settings.enableSidebar": "显示侧栏主题面板",
				"settings.enableSidebar.desc": "在输入框下方显示「主题」按钮，并在 Better Sidebar 中注册主题标签页；关闭后按钮、标签页与已打开的面板一并收起。",
				"settings.model": "总结模型",
				"settings.model.desc": "用于把对话整理成主题的模型",
				"settings.advanced": "高级",
				"settings.maxTopics": "主题数量上限",
				"settings.maxTopics.desc": "一次对话最多整理出多少个主题（3-100）",
				"settings.backfill": "首次回填回合数",
				"settings.backfill.desc": "新会话载入时，向前整理多少个历史回合（0-100）",
				"settings.save": "保存",
				"settings.saved": "已保存",
				"settings.saving": "保存中…",
				"settings.error": "保存失败",
				"settings.guide": "使用说明",
				"settings.guide.rail": "刻度条：悬停展开，滚动胶囊查看全部主题；点击某一行跳到该主题的开头。",
				"settings.guide.back": "回到最新：胶囊最下方一行，滚动到这段对话的最末尾。",
				"settings.guide.sidebar": "侧栏面板：支持关键词搜索、语义搜索、跨会话检索，以及从某个主题「继续讨论」。",
				"settings.guide.auto": "主题由总结模型自动维护：每完成一个回合增量更新，不需要手动触发。",
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
				"rail.backToLatest": "Back to latest",
				"settings.title": "Session topics",
				"settings.desc": "The topic tick strip on the right edge, plus the sidebar panel for browsing a conversation by topic",
				"settings.enableRail": "Show the topic rail",
				"settings.enableRail.desc": "Replaces the native tick strip on the right edge of the conversation: resegmented by topic, hover to open the capsule with topic names, click to jump. Turning it off restores the native strip.",
				"settings.enableSidebar": "Show the sidebar panel",
				"settings.enableSidebar.desc": "Adds a Topics button under the composer and registers the topics tab in Better Sidebar; turning it off hides the button, unregisters the tab and closes an open panel.",
				"settings.model": "Summarizer model",
				"settings.model.desc": "The model that turns the conversation into topics",
				"settings.advanced": "Advanced",
				"settings.maxTopics": "Maximum topics",
				"settings.maxTopics.desc": "How many topics one conversation can be split into (3-100)",
				"settings.backfill": "Initial backfill turns",
				"settings.backfill.desc": "How many historical turns to summarize when a session loads (0-100)",
				"settings.save": "Save",
				"settings.saved": "Saved",
				"settings.saving": "Saving…",
				"settings.error": "Save failed",
				"settings.guide": "How it works",
				"settings.guide.rail": "Rail: hover to expand, scroll inside the capsule for every topic, click a row to jump to that topic.",
				"settings.guide.back": "Back to latest sits on the last capsule row and scrolls to the end of the conversation.",
				"settings.guide.sidebar": "Sidebar panel: keyword and semantic search, cross-session results, and “continue discussing” from any topic.",
				"settings.guide.auto": "Topics are maintained by the summarizer model: one incremental update per completed turn, no manual trigger.",
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
		/**
		 * Jump to a topic. Loading history for an old topic can take seconds, so
		 * the rail marks the row busy and locks re-entrant jumps — the old
		 * version let three clicks start three paging races and swallow each
		 * other, which read as "click does nothing".
		 */
		async function jumpToTopic(topic, loadThrough) {
			if (railDom.jumping) return false;
			railDom.jumping = true;
			const row = railDom.list === null
				? null
				: railDom.list.querySelector(`[data-topic-id="${railCssEscape(String(topic.id))}"]`);
			row?.classList.add("str-rowBusy");
			try {
				if (typeof loadThrough === "function") {
					try {
						await loadThrough(topic.startSeq);
					} catch {
						/* fall back to DOM paging */
					}
				}
				return await scrollToTurn(topic.startTurn);
			} finally {
				row?.classList.remove("str-rowBusy");
				railDom.jumping = false;
			}
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

		/**
		 * Pin the transcript to the newest exchange. Two passes with a frame
		 * between them, because the virtualiser may still be appending the
		 * tail when the click lands; then the rail re-measures so the active
		 * tick snaps back to the last topic.
		 */
		/**
		 * "Back to latest" — workbuddy-style: smooth scroll, then re-check until
		 * the scroller is actually at the end. The old version wrote scrollTop
		 * three times 60 ms apart, which fought the virtualized list (each write
		 * landed before the previous page had grown) and looked like an instant
		 * jump on long conversations.
		 */
		async function scrollToBottom() {
			const scroller = chatScroller();
			if (scroller !== null) {
				scroller.scrollTo({ top: scroller.scrollHeight, behavior: "smooth" });
			}
			// The virtualized list grows as the smooth scroll approaches the end,
			// so keep pushing until the bottom stops moving.
			let lastBottom = -1;
			let stable = 0;
			for (let attempt = 0; attempt < 40; attempt += 1) {
				await delay(120);
				const current = chatScroller();
				if (current === null) continue;
				const bottom = Math.round(current.scrollTop + current.clientHeight);
				const atEnd = bottom >= current.scrollHeight - 2;
				if (atEnd) {
					stable += 1;
					if (stable >= 2) break;
				} else {
					stable = 0;
					current.scrollTo({ top: current.scrollHeight, behavior: "smooth" });
				}
				if (bottom === lastBottom) {
					// Nothing is moving and we are not at the end: force it once.
					if (!atEnd) current.scrollTop = current.scrollHeight;
				}
				lastBottom = bottom;
			}
			post("rail-mount", { stage: "rail-back-to-latest", ok: chatScroller() !== null }).catch(() => {});
			railDom.activeId = null;
			railScheduleMeasure();
		}

		/** A jump requested from another session's panel, consumed once the target panel loads. */
		const pendingJump = { sessionId: null, turn: 0, seq: 0 };

		// ---------- styles ----------

		const CSS = `
.stp-root{display:flex;flex-direction:column;height:100%;min-height:0;font-size:13px;color:var(--dsw-alias-label-primary)}
.sts-root{display:flex;flex-direction:column;gap:18px;font-size:13px;color:var(--dsw-alias-label-primary)}
.sts-block{display:flex;flex-direction:column;border-top:.5px solid var(--dsw-alias-border-l2)}
.sts-block:first-child{border-top:0}
.sts-row{display:flex;align-items:center;gap:12px;padding:14px 0;border-bottom:.5px solid var(--dsw-alias-border-l2)}
.sts-block .sts-row:last-child{border-bottom:0}
.sts-rowText{flex:1;min-width:0;display:flex;flex-direction:column;gap:3px}
.sts-rowTitle{font-size:14px;line-height:22px;color:var(--dsw-alias-label-primary)}
.sts-rowDesc{font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary)}
.sts-rowCtl{flex:none;display:flex;align-items:center;gap:8px}
.sts-switch{position:relative;flex:none;width:38px;height:22px;padding:0;border:0;border-radius:11px;background:var(--dsw-alias-border-l2);cursor:pointer;transition:background .18s ease}
.sts-switch.sts-on{background:var(--dsw-alias-state-business-primary,#4176e6)}
.sts-switch:disabled{cursor:default;opacity:.5}
.sts-knob{position:absolute;top:2px;left:2px;width:18px;height:18px;border-radius:50%;background:#fff;box-shadow:0 1px 2px rgba(0,0,0,.25);transition:transform .18s ease}
.sts-switch.sts-on .sts-knob{transform:translateX(16px)}
.sts-pair{display:flex;align-items:center;gap:8px;flex-wrap:wrap;justify-content:flex-end}
.sts-input{height:32px;padding:0 10px;border:.5px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-sm);background:var(--dsw-alias-bg-module-platform,transparent);color:var(--dsw-alias-label-primary);font-size:13px;font-family:inherit}
.sts-input:focus{outline:none;border-color:var(--dsw-alias-state-business-primary,#4176e6)}
.sts-num{width:88px;text-align:right}
.sts-actions{display:flex;align-items:center;justify-content:flex-end;gap:10px;padding:12px 0 4px}
.sts-status{font-size:12px;color:var(--dsw-alias-label-tertiary)}
.sts-save{height:32px;padding:0 16px;border:0;border-radius:var(--dsw-radius-sm);background:var(--dsw-alias-state-business-primary,#4176e6);color:#fff;font-size:13px;font-family:inherit;cursor:pointer}
.sts-save:disabled{opacity:.45;cursor:default}
.sts-guideTitle{font-size:13px;font-weight:500;padding:14px 0 6px;color:var(--dsw-alias-label-primary)}
.sts-guide{margin:0;padding:0 0 4px 18px;display:flex;flex-direction:column;gap:6px;font-size:12px;line-height:19px;color:var(--dsw-alias-label-secondary)}
.sts-guide li{list-style:disc}
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

/* ---------- topic rail (right edge, workbuddy-style) ----------
   One row per topic: [title … tick], right-aligned. Collapsed, rows are
   20px tall with equal 12px ticks (active = dark + translucent border);
   a small arrow row ("back to latest") sits directly below the active
   tick. Hovering anywhere on the rail grows every row to 44px, titles
   fade in left of the ticks, the active tick lengthens and its text turns
   bold, and the whole list sits inside one translucent capsule; leaving
   reverses it. Growth is staggered outward
   from the row under the cursor, and JS shifts the frame top so that row
   stays exactly under the cursor while everything grows around it. The
   frame is pointer-events:none and :hover bubbles up from the list. */
/* Capsule intent mirrors workbuddy: rest state is the thin ticks bare on
   the page; the single panel capsule fades in with the growth, so the
   dialog look belongs to the expanded state only. */
.str-frame{--str-w-closed:40px;--str-w-expanded:320px;--str-row-rest:20px;--str-row-hover:38px;--str-visible-rows:12;--str-expanded-rows:10;--str-open-dur:.543s;--str-close-dur:.343s;--str-open-ease:cubic-bezier(.16,1,.3,1);--str-close-ease:cubic-bezier(.45,0,.3,1);--str-right:12px;position:fixed;top:50%;right:var(--str-right);z-index:30;display:flex;justify-content:flex-end;align-items:center;pointer-events:none;transform:translateY(-50%);transition:right var(--str-open-dur) var(--str-open-ease)}
.str-frame.str-open{transition-duration:var(--str-open-dur);transition-timing-function:var(--str-open-ease)}
.str-surface{position:absolute;top:0;right:0;bottom:0;width:var(--str-w-closed);border:0 solid color-mix(in srgb,var(--dsw-alias-label-primary) 12%,transparent);border-radius:16px;opacity:0;background:color-mix(in srgb,var(--dsw-alias-bg-layer-1,var(--dsw-alias-bg-base)) 90%,transparent);backdrop-filter:blur(12px) saturate(1.1);-webkit-backdrop-filter:blur(12px) saturate(1.1);box-shadow:0 6px 24px -8px rgb(0 0 0 / 18%);transition:width var(--str-close-dur) var(--str-close-ease),opacity var(--str-close-dur) var(--str-close-ease)}
.str-frame.str-open .str-surface{width:var(--str-w-expanded);opacity:1;border-width:.5px;transition-duration:var(--str-open-dur);transition-timing-function:var(--str-open-ease)}
.str-panel{position:relative;width:max-content;min-width:var(--str-w-closed);max-width:var(--str-w-expanded);overflow:hidden;border-radius:16px;pointer-events:none;clip-path:inset(0 0 0 calc(100% - var(--str-w-closed)) round 16px);transition:clip-path var(--str-close-dur) var(--str-close-ease)}
.str-frame.str-open .str-panel{clip-path:inset(0 0 0 0 round 16px);pointer-events:auto;transition-duration:var(--str-open-dur);transition-timing-function:var(--str-open-ease)}
.str-list{width:max-content;min-width:var(--str-w-closed);max-width:var(--str-w-expanded);box-sizing:border-box;display:flex;flex-direction:column;align-items:flex-end;padding:6px 4px 6px 8px;height:calc(var(--str-row-rest) * var(--str-visible-rows) + 12px);overflow:hidden;scrollbar-width:none;pointer-events:auto;transition:height var(--str-close-dur) var(--str-close-ease)}
.str-frame.str-open .str-list{height:calc(var(--str-row-hover) * var(--str-expanded-rows) + 10px);padding-right:12px;overflow-y:auto;transition-duration:var(--str-open-dur);transition-timing-function:var(--str-open-ease)}
.str-list.str-jump .str-row{transition:none}
.str-list::-webkit-scrollbar{width:0;display:none}
.str-frame.str-open .str-list::-webkit-scrollbar{width:4px;display:block}
.str-frame.str-open .str-list::-webkit-scrollbar-thumb{border-radius:999px;background:color-mix(in srgb,var(--dsw-alias-label-primary) 24%,transparent)}
.str-row{position:relative;box-sizing:border-box;display:flex;align-items:center;justify-content:flex-end;gap:12px;width:100%;height:var(--str-row-rest);padding:0 8px 0 12px;border:0;background:0 0;color:var(--dsw-alias-label-secondary);cursor:default;pointer-events:none;overflow:hidden;flex:none;font:inherit;font-size:13px;line-height:var(--str-row-rest);text-align:right;transition:height var(--str-close-dur) var(--str-close-ease),color var(--str-close-dur) var(--str-close-ease)}
.str-frame.str-open .str-row{height:var(--str-row-hover);cursor:pointer;pointer-events:auto;transition-duration:var(--str-open-dur);transition-timing-function:var(--str-open-ease)}
.str-rowWhen{flex:0 0 auto;font-size:11px;line-height:1;letter-spacing:.1px;white-space:nowrap;color:color-mix(in srgb,var(--dsw-alias-label-tertiary,var(--dsw-alias-label-secondary)) 70%,transparent);font-variant-numeric:tabular-nums;opacity:0;max-width:0;overflow:hidden;transition:opacity var(--str-close-dur) var(--str-close-ease),max-width var(--str-close-dur) var(--str-close-ease);margin-right:2px}
.str-frame.str-open .str-rowWhen{opacity:1;max-width:96px;transition-duration:var(--str-open-dur);transition-timing-function:var(--str-open-ease)}
.str-rowText{min-width:0;flex:1 1 auto;opacity:0;transform:translate(16px);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:right;transition:opacity var(--str-close-dur) var(--str-close-ease),transform var(--str-close-dur) var(--str-close-ease)}
.str-frame.str-open .str-rowText{opacity:1;transform:translate(0);transition-duration:var(--str-open-dur);transition-timing-function:var(--str-open-ease)}
.str-row.str-rowActive .str-rowText{color:var(--dsw-alias-label-primary);font-weight:500}
.str-tick{flex:0 0 auto;box-sizing:content-box;width:12px;height:0;border:0;border-top:1px solid color-mix(in srgb,var(--dsw-alias-label-primary) 20%,transparent);border-radius:0;background:0 0;transition:width var(--str-close-dur) var(--str-close-ease),border-color var(--str-close-dur) var(--str-close-ease)}
.str-frame.str-open .str-tick{transition-duration:var(--str-open-dur);transition-timing-function:var(--str-open-ease)}
.str-row:not(.str-rowBack).str-rowActive .str-tick{width:28px;border-top-color:var(--dsw-alias-label-primary);border-top-width:1.5px}
.str-row:not(.str-rowBack):hover .str-tick{width:20px;border-top-color:currentColor}
/* The back row keeps a triangle whose SIZE never changes: only its colour
   follows hover, so the arrow cannot morph into a trapezium when the shared
   .str-tick rules widen it. */
.str-rowBack .str-tick,.str-rowBack:hover .str-tick,.str-frame.str-open .str-rowBack .str-tick{flex:0 0 auto;box-sizing:content-box;width:0;height:0;border:0;border-top:5px solid color-mix(in srgb,var(--dsw-alias-label-primary) 50%,transparent);border-left:4px solid transparent;border-right:4px solid transparent;border-radius:0;background:0 0;transition:border-top-color var(--str-close-dur) var(--str-close-ease)}
.str-rowBack:hover .str-tick{border-top-color:var(--dsw-alias-label-primary)}
.str-rowBusy .str-tick{animation:str-pulse 1s ease-in-out infinite}
.str-row:focus-visible{outline:1px solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:-2px}
@media (max-width:900px){.str-frame{display:none}}
@media (prefers-reduced-motion:reduce){.str-row,.str-rowText,.str-tick{transition:none;animation:none}}
/* The host TurnNavigator tick rail is hidden ONLY while our rail is on.
   The rule is scoped to <html data-str-rail-on>, so switching the rail off
   restores the native strip immediately instead of leaving a gap. Exact
   hashed class from the dsh-client-ui-chat build: if DSH changes the hash
   the rule simply stops matching (native rail reappears) and can never hit
   another element. No wildcards. */
html[data-str-rail-on] ._4if9eW_frame{display:none!important}


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
		/**
		 * Live plugin preferences, mirrored from the Host config.
		 *
		 * Two switches decide the two entry points (rail / sidebar panel) and the
		 * advanced values feed the Host's summarizer. The store is a plain
		 * snapshot so every React surface and the self-owned rail DOM can read
		 * the same truth without a Context.
		 */
		const PREFS_DEFAULT = {
			enableRail: true,
			enableSidebar: true,
			maxTopics: 20,
			initBackfillCount: 10,
			assistantExcerptChars: 500,
			language: "auto",
			searchResultLimit: 50,
			semanticCandidateLimit: 100,
			summarizer: null,
		};
		const prefsState = { value: { ...PREFS_DEFAULT }, loaded: false };
		const prefsListeners = new Set();
		const prefsStore = {
			subscribe: (listener) => {
				prefsListeners.add(listener);
				return () => prefsListeners.delete(listener);
			},
			getSnapshot: () => prefsState.value,
		};
		const prefsSet = (next) => {
			prefsState.value = { ...prefsState.value, ...next };
			prefsState.loaded = true;
			for (const listener of [...prefsListeners]) {
				try {
					listener();
				} catch {
					/* listener detached */
				}
			}
		};
		let prefsInflight = null;
		const refreshPrefs = () => {
			if (prefsInflight !== null) return prefsInflight;
			prefsInflight = api("config")
				.then((data) => {
					prefsSet({
						...PREFS_DEFAULT,
						enableRail: data?.enableRail !== false,
						enableSidebar: data?.enableSidebar !== false,
						maxTopics: data?.maxTopics ?? PREFS_DEFAULT.maxTopics,
						initBackfillCount: data?.initBackfillCount ?? PREFS_DEFAULT.initBackfillCount,
						assistantExcerptChars: data?.assistantExcerptChars ?? PREFS_DEFAULT.assistantExcerptChars,
						language: data?.language ?? PREFS_DEFAULT.language,
						searchResultLimit: data?.searchResultLimit ?? PREFS_DEFAULT.searchResultLimit,
						semanticCandidateLimit: data?.semanticCandidateLimit ?? PREFS_DEFAULT.semanticCandidateLimit,
						summarizer: data?.summarizer ?? null,
					});
					return prefsState.value;
				})
				.catch(() => prefsState.value)
				.finally(() => {
					prefsInflight = null;
				});
			return prefsInflight;
		};
		const patchPrefs = (patch) => post("config-patch", patch).then((data) => {
			// The route answers with the whole effective settings object, so the
			// store mirrors the Host exactly instead of guessing at defaults.
			const cfg = data?.config ?? data;
			if (cfg !== undefined && cfg !== null) {
				prefsSet({
					enableRail: cfg.enableRail !== false,
					enableSidebar: cfg.enableSidebar !== false,
					maxTopics: cfg.maxTopics ?? PREFS_DEFAULT.maxTopics,
					initBackfillCount: cfg.initBackfillCount ?? PREFS_DEFAULT.initBackfillCount,
					assistantExcerptChars: cfg.assistantExcerptChars ?? PREFS_DEFAULT.assistantExcerptChars,
					language: cfg.language ?? PREFS_DEFAULT.language,
					searchResultLimit: cfg.searchResultLimit ?? PREFS_DEFAULT.searchResultLimit,
					semanticCandidateLimit: cfg.semanticCandidateLimit ?? PREFS_DEFAULT.semanticCandidateLimit,
					summarizer: cfg.summarizer ?? data?.summarizer ?? prefsState.value.summarizer,
				});
			}
			return data;
		});

		const usePrefs = () => useSyncExternalStore(prefsStore.subscribe, prefsStore.getSnapshot, () => PREFS_DEFAULT);

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
					"data-session-topics-tool": "1",
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


		/**
		 * One settings row: label + description on the left, the control on the
		 * right, mirroring the shell's own settings rows so our section does not
		 * look foreign next to General / Models / Built-in plugins.
		 */
		function SettingsRow({ title, desc, children }) {
			return h(
				"div",
				{ className: "sts-row" },
				h(
					"div",
					{ className: "sts-rowText" },
					h("div", { className: "sts-rowTitle" }, title),
					desc === undefined ? null : h("div", { className: "sts-rowDesc" }, desc),
				),
				h("div", { className: "sts-rowCtl" }, children),
			);
		}

		/** The pill switch used by both entry-point toggles. */
		function SettingsSwitch({ checked, disabled, onChange, label }) {
			return h(
				"button",
				{
					type: "button",
					role: "switch",
					"aria-checked": checked ? "true" : "false",
					"aria-label": label,
					className: checked ? "sts-switch sts-on" : "sts-switch",
					disabled: disabled === true,
					onClick: () => onChange(!checked),
				},
				h("span", { className: "sts-knob" }),
			);
		}

		/**
		 * The "Session topics" settings section.
		 *
		 * Reads and writes the plugin's own Host config (the same document the
		 * sidebar panel's ⚙ used to edit), so there is exactly one source of
		 * truth for both entry points.
		 */
		function SessionTopicsSection({ t }) {
			const prefs = useSyncExternalStore(prefsStore.subscribe, prefsStore.getSnapshot, () => PREFS_DEFAULT);
			const [catalog, setCatalog] = useState(null);
			const [maxTopics, setMaxTopics] = useState("");
			const [backfill, setBackfill] = useState("");
			const [provider, setProvider] = useState("");
			const [model, setModel] = useState("");
			const [status, setStatus] = useState(null);
			const seeded = useRef(false);

			useEffect(() => {
				refreshPrefs();
				api("models")
					.then((data) => setCatalog(data?.providers ?? []))
					.catch(() => setCatalog([]));
			}, []);

			useEffect(() => {
				if (seeded.current) return;
				if (!prefsState.loaded) return;
				seeded.current = true;
				setMaxTopics(String(prefs.maxTopics));
				setBackfill(String(prefs.initBackfillCount));
				setProvider(prefs.summarizer?.provider ?? "");
				setModel(prefs.summarizer?.model ?? "");
			}, [prefs]);

			const commit = useCallback(
				(patch) => {
					setStatus("saving");
					patchPrefs(patch)
						.then(() => setStatus("saved"))
						.catch(() => setStatus("error"));
				},
				[],
			);

			const providers = catalog ?? [];
			const models = providers.find((entry) => entry.provider === provider)?.models ?? [];
			const dirty =
				String(prefs.maxTopics) !== maxTopics.trim() ||
				String(prefs.initBackfillCount) !== backfill.trim() ||
				(prefs.summarizer?.provider ?? "") !== provider ||
				(prefs.summarizer?.model ?? "") !== model;

			return h(
				"div",
				{ className: "sts-root" },
				h(
					"div",
					{ className: "sts-block" },
					h(
						SettingsRow,
						{ title: t("settings.enableRail"), desc: t("settings.enableRail.desc") },
						h(SettingsSwitch, {
							checked: prefs.enableRail,
							label: t("settings.enableRail"),
							onChange: (next) => commit({ enableRail: next }),
						}),
					),
					h(
						SettingsRow,
						{ title: t("settings.enableSidebar"), desc: t("settings.enableSidebar.desc") },
						h(SettingsSwitch, {
							checked: prefs.enableSidebar,
							label: t("settings.enableSidebar"),
							onChange: (next) => commit({ enableSidebar: next }),
						}),
					),
				),
				h(
					"div",
					{ className: "sts-block" },
					h(
						SettingsRow,
						{ title: t("settings.model"), desc: t("settings.model.desc") },
						h(
							"div",
							{ className: "sts-pair" },
							h(
								"select",
								{
									className: "sts-input",
									value: provider,
									onChange: (event) => {
										setProvider(event.target.value);
										setModel("");
									},
								},
								h("option", { value: "" }, "—"),
								providers.map((entry) =>
									h("option", { key: entry.provider, value: entry.provider }, entry.name ?? entry.provider),
								),
							),
							h(
								"select",
								{
									className: "sts-input",
									value: model,
									onChange: (event) => setModel(event.target.value),
								},
								h("option", { value: "" }, "—"),
								models.map((entry) => h("option", { key: entry.id, value: entry.id }, entry.name ?? entry.id)),
							),
						),
					),
					h(
						SettingsRow,
						{ title: t("settings.maxTopics"), desc: t("settings.maxTopics.desc") },
						h("input", {
							className: "sts-input sts-num",
							type: "number",
							min: 3,
							max: 100,
							value: maxTopics,
							onChange: (event) => setMaxTopics(event.target.value),
						}),
					),
					h(
						SettingsRow,
						{ title: t("settings.backfill"), desc: t("settings.backfill.desc") },
						h("input", {
							className: "sts-input sts-num",
							type: "number",
							min: 0,
							max: 100,
							value: backfill,
							onChange: (event) => setBackfill(event.target.value),
						}),
					),
					h(
						"div",
						{ className: "sts-actions" },
						status === null ? null : h("span", { className: "sts-status" }, t(`settings.${status}`)),
						h(
							"button",
							{
								type: "button",
								className: "sts-save",
								disabled: !dirty || provider.length === 0 || model.length === 0,
								onClick: () =>
									commit({
										maxTopics: Number(maxTopics),
										initBackfillCount: Number(backfill),
										summarizer: { provider, model },
									}),
							},
							t("settings.save"),
						),
					),
				),
				h(
					"div",
					{ className: "sts-block" },
					h("div", { className: "sts-guideTitle" }, t("settings.guide")),
					h("ul", { className: "sts-guide" },
						h("li", null, t("settings.guide.rail")),
						h("li", null, t("settings.guide.back")),
						h("li", null, t("settings.guide.sidebar")),
						h("li", null, t("settings.guide.auto")),
					),
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
			const [summarizer, setSummarizer] = useState(null);
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

			// The panel no longer edits settings — everything moved into
			// Settings → Session topics. It only mirrors the summarizer route for
			// the header line, so the SSE "config" frame stays in sync.
			const loadConfig = useCallback(() => {
				api("config")
					.then((data) => setSummarizer(data.summarizer ?? null))
					.catch(() => {});
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
				),
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
		 * Inject the rail stylesheet once, with an id so a second call (panel +
		 * rail) is a no-op. The rail keepalive re-injects it if the host ever
		 * drops the element from <head>.
		 */
		let railStyleReady = false;
		function ensureRailStyle() {
			if (railStyleReady) return;
			if (document.getElementById("str-rail-style") !== null) { railStyleReady = true; return; }
			const el = document.createElement("style");
			el.id = "str-rail-style";
			el.textContent = CSS;
			document.head.appendChild(el);
			railStyleReady = true;
		}

		// ---------- topic rail (self-owned DOM edition) ----------
		//
		// A slim always-on rail on the right edge of the transcript, mirroring
		// the shell's own turn navigator (TurnNavigator in dsh-client-ui-chat):
		// one short mark per topic, hover text, click-to-jump.
		//
		// It used to mount per visible turn through the conversation.chat.turnTail
		// slot, but the chat virtualiser tears those rows down aggressively
		// (rail-mount logs: three portals created at boot, all deleted within
		// 50 ms, never recreated). The native navigator survives that rhythm only
		// because the HOST re-renders it inside every recycled row. The rail now
		// owns a fixed div on document.body and keeps itself alive with its own
		// keepalive loop: no slot lifecycle, no React mount, nothing the
		// virtualiser can unmount. Rows are plain DOM styled by the same .str-*
		// rules the stylesheet block already defines.

		/** Clip a string to `limit` characters, appending an ellipsis when cut. */
		function clip(text, limit) {
			const value = String(text ?? "").replace(/\s+/g, " ").trim();
			return value.length > limit ? `${value.slice(0, limit - 1).trimEnd()}…` : value;
		}

		const railDom = {
			started: false,
			frame: null,
			list: null,
			sessionId: undefined,
			topics: [],
			phase: "idle",
			activeId: null,
			hidden: false,
			source: null,
			keepalive: null,
			measureFrame: null,
			opts: null,
			reappends: 0,
			backRow: null,
			surface: null,
			panel: null,
			expanded: false,
			hoverTop: null,
			sliceSize: 12,
			jumping: false,
			hoverAnchor: null,
			pendingScrollTop: null,
			pendingTimer: null,
			visibleRows: 12,
			windowStart: 0,
			restamped: new Set(),
		};

		/** How many topic rows the collapsed capsule shows at once. */
		function railVisibleRows() {
			const raw = railDom.list === null ? "" : getComputedStyle(railDom.list).getPropertyValue("--str-visible-rows");
			const parsed = Number.parseInt(raw, 10);
			if (Number.isFinite(parsed) && parsed > 2) return parsed;
			// Fallback: fit the window into the viewport at 20px a row.
			return Math.max(6, Math.min(20, Math.floor((window.innerHeight * 0.62) / 20)));
		}

		/**
		 * Attribute-selector escaping without CSS.escape: the DSH renderer
		 * environment shadows the global `CSS` object, so `CSS.escape` is not
		 * guaranteed to exist and used to throw inside railOpen.
		 */
		function railCssEscape(value) {
			if (typeof CSS !== "undefined" && typeof CSS?.escape === "function") return CSS.escape(value);
			return String(value).replace(/["\\]/g, "\\$&");
		}

		function railRows() {
			return Array.isArray(railDom.topics) ? railDom.topics : [];
		}

		/** loadThrough bound to the rail's current session, jumpToTopic-shaped. */
		function railBindLoadThrough() {
			const opts = railDom.opts;
			const sessionId = railDom.sessionId;
			if (opts === null || typeof opts.loadThrough !== "function" || sessionId == null) return undefined;
			return (seq) => opts.loadThrough(sessionId, seq);
		}

		/** (Re)build the rail rows from the current topic list. */
		function railRender(anchorId) {
			if (!railDom.started || railDom.frame === null) return;
			ensureRailStyle();
			const rows = railRows();
			// Single authority for the frame's visibility: the hidden flag set by
			// syncHidden. Anything that re-renders (measure, keepalive, session
			// switch) must not resurrect a rail the user switched off.
			railDom.frame.style.display = railDom.hidden || rows.length === 0 ? "none" : "";
			railDom.frame.style.pointerEvents = railDom.hidden ? "none" : "";
			const list = railDom.list;
			// Fixed-height window instead of a long scrolling ribbon: only the
			// rows around the active topic are built, so 50 topics still cost
			// 12 rows of DOM and the capsule keeps one stable height.
			const maxRows = railVisibleRows();
			const windowSize = Math.min(maxRows, rows.length);
			railDom.visibleRows = windowSize;
			// Rows actually attached to the DOM: enough for the expanded window,
			// anchored so both the ACTIVE row and the hovered row are inside.
			const sliceSize = Math.min(rows.length, Math.max(windowSize, Math.min(railExpandRows(), rows.length)));
			// While the capsule is open the expanded window is the readable one,
			// so grow the slice to the full expanded capacity.
			const sliceTarget = railDom.expanded ? Math.min(rows.length, railExpandRows()) : sliceSize;
			// Row count drives the height (CSS: 20px × --str-visible-rows), so a
			// 3-topic session gets a 3-row tick strip instead of a 12-row hole.
			list.style.setProperty("--str-visible-rows", String(Math.max(1, windowSize)));
			// Expanded height = rows × 38px, computed here so the CSS transition
			// has a concrete target and nothing is clipped mid-row.
			// workbuddy window model: the COLLAPSED strip only ever renders a
			// short slice, but the EXPANDED window can hold railExpandRows()
			// rows and must reach far enough back/forward to contain whatever
			// row the user hovers or scrolls to. So the rendered slice size is
			// the expanded capacity, and the CSS height (20px × visible rows)
			// is what actually hides the rest while collapsed.
			const expandCap = Math.min(railExpandRows(), Math.max(3, rows.length));
			railDom.frame?.style.setProperty("--str-expanded-rows", String(Math.max(3, expandCap)));

			// Like workbuddy: the window shows a slice of rows and the box height
			// is that slice × row height, so nothing is ever clipped mid-row.
			railDom.visibleRows = windowSize;
			const followActive = anchorId === undefined;
			const wanted = anchorId ?? railDom.activeId;
			// The window size follows the open/closed state: collapsed shows the
			// compact slice, expanded grows to railExpandRows().
			const wantedIndex = rows.findIndex((topic, index) => String(topic.id ?? index) === String(wanted ?? ""));
			const activeIndexForView = rows.findIndex(
				(topic, index) => String(topic.id ?? index) === String(railDom.activeId ?? ""),
			);
			// Window stability: once a slice exists that already contains the row
			// the capsule is read against (the ACTIVE one), keep it. Re-centring
			// on every render is what used to make the active tick jump out of
			// view on every re-hover.
			const currentStart = railDom.windowStart ?? 0;
			const currentSlice = railDom.sliceSize ?? sliceTarget;
			const stableStart = Math.max(0, Math.min(currentStart, Math.max(0, rows.length - sliceTarget)));
			const insideCurrent = (index) => index >= stableStart && index < stableStart + currentSlice;
			const readable = activeIndexForView >= 0 ? activeIndexForView : wantedIndex;
			let anchor = wantedIndex;
			if (anchor < 0) anchor = followActive ? rows.length - 1 : Math.floor(sliceTarget / 2);
			if (readable >= 0 && insideCurrent(readable)) {
				anchor = readable;
			} else if (followActive || activeIndexForView < 0) {
				anchor = readable >= 0 ? readable : anchor;
			}
			// When the user hovers a row far from the active one, the window has
			// to cover BOTH, otherwise opening on a row that is outside the
			// active slice can never show the active tick at the same time.
			if (!followActive && wantedIndex >= 0 && activeIndexForView >= 0 && wantedIndex !== activeIndexForView) {
				const span = Math.abs(wantedIndex - activeIndexForView);
				if (span >= sliceTarget && activeIndexForView < wantedIndex) anchor = wantedIndex;
			}
			let start = rows.length <= sliceTarget ? 0 : anchor - Math.floor(sliceTarget / 2);
			start = Math.max(0, Math.min(start, Math.max(0, rows.length - sliceTarget)));
			// Never let the ACTIVE row fall outside the slice it is read from.
			if (activeIndexForView >= 0 && sliceTarget < rows.length) {
				if (activeIndexForView < start) start = activeIndexForView;
				else if (activeIndexForView >= start + sliceTarget) start = activeIndexForView - sliceTarget + 1;
				start = Math.max(0, Math.min(start, Math.max(0, rows.length - sliceTarget)));
			}
			railDom.windowStart = start;
			railDom.sliceSize = sliceTarget;
			const slice = rows.slice(start, start + sliceTarget);
			while (list.firstChild !== null) list.removeChild(list.firstChild);
			for (let index = 0; index < slice.length; index += 1) {
				const topic = slice[index];
				const button = document.createElement("button");
				button.type = "button";
				button.className = "str-row";
				button.dataset.topicId = String(topic.id ?? index);
				button.setAttribute("aria-label", clip(topic.title, 60));
				// Date column: a quiet grey stamp on the LEFT of the title, so the
				// eye can scan "when" without reading the title itself. Rendered
				// only when the host could resolve a real timestamp.
				const when = railFormatWhen(topic.startedAt);
				if (when !== "") {
					const stamp = document.createElement("span");
					stamp.className = "str-rowWhen";
					stamp.textContent = when;
					button.append(stamp);
				}
				const text = document.createElement("span");
				text.className = "str-rowText";
				text.textContent = clip(topic.title, 60);
				const tick = document.createElement("span");
				tick.className = "str-tick";
				button.append(text, tick);
				button.addEventListener("click", () => {
					jumpToTopic(topic, railBindLoadThrough()).catch(() => {});
				});
				list.appendChild(button);
			}

			// "Back to latest" is pinned as the last row of the capsule: it is an
			// action, not a topic, so it never follows the active tick around.
			const back = railDom.backRow ?? document.createElement("button");
			back.type = "button";
			back.className = "str-row str-rowBack";
			back.setAttribute("data-role", "back-to-latest");
			const backLabel = typeof railDom.opts?.t === "function" ? railDom.opts.t("rail.backToLatest") : "回到最新";
			back.setAttribute("aria-label", backLabel);
			while (back.firstChild !== null) back.removeChild(back.firstChild);
			const backText = document.createElement("span");
			backText.className = "str-rowText";
			backText.textContent = backLabel;
			const backTick = document.createElement("span");
			backTick.className = "str-tick";
			back.append(backText, backTick);
			if (!back.dataset.bound) {
				back.dataset.bound = "1";
				back.addEventListener("click", (event) => {
					event.preventDefault();
					event.stopPropagation();
					void scrollToBottom();
				});
				// The list is re-rendered on topic updates, so a rebuilt row can
				// swallow the click. stopPropagation keeps hover handlers from
				// treating it as an anchor and pointerup re-fires the action.
				back.addEventListener("pointerdown", (event) => event.stopPropagation());
				back.addEventListener("pointerup", (event) => {
					event.preventDefault();
					event.stopPropagation();
				});
			}
			railDom.backRow = back;
			const stale = list.querySelector('[data-role="back-to-latest"]');
			if (stale !== null && stale !== back) stale.remove();
			list.appendChild(back);
			railApplyState();
			railScheduleMeasure();
			if (!railDom.expanded) railPosition();
		}


		/**
		 * Apply active/busy classes onto the already-built rows, keep the
		 * "back to latest" row directly below the active one, and refresh the
		 * hover-ripple delays so expansion always starts at the current
		 * conversation's tick.
		 */
		/**
		 * Compact local timestamp for a rail row.
		 *
		 * Today → `HH:MM`; this year → `MM-DD`; older → `YYYY-MM-DD`. The rail is
		 * a glance surface, so the string stays short and only widens when the
		 * extra digits actually disambiguate.
		 */
		function railFormatWhen(value) {
			if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return "";
			const date = new Date(value);
			if (Number.isNaN(date.getTime())) return "";
			const now = new Date();
			const pad = (n) => String(n).padStart(2, "0");
			const sameDay =
				date.getFullYear() === now.getFullYear() &&
				date.getMonth() === now.getMonth() &&
				date.getDate() === now.getDate();
			// Date AND time: the rail is a map of a long conversation, so the day
			// is what disambiguates topics far apart, and the clock still tells
			// today's apart. Today drops the date because it adds nothing there.
			const clock = `${pad(date.getHours())}:${pad(date.getMinutes())}`;
			if (sameDay) return clock;
			const day = `${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
			return date.getFullYear() === now.getFullYear() ? `${day} ${clock}` : `${date.getFullYear()}-${day}`;
		}

		/**
		 * Publish the rail's on/off state to the document so the stylesheet can
		 * suppress the host's native tick strip only while we are showing ours.
		 * Switching the rail off therefore restores the native navigator instead
		 * of leaving the edge empty.
		 */
		function railApplyNative() {
			try {
				const root = document.documentElement;
				if (railDom.hidden) root.removeAttribute("data-str-rail-on");
				else root.setAttribute("data-str-rail-on", "");
			} catch { /* document not ready */ }
		}

		function railApplyState() {
			const list = railDom.list;
			if (list === null) return;
			const busy = railDom.phase === "summarizing";
			const activeKey = railDom.activeId == null ? null : String(railDom.activeId);
			const rows = railRows();
			const start = railDom.windowStart ?? 0;
			const buttons = list.querySelectorAll(".str-row[data-topic-id]");
			buttons.forEach((button, index) => {
				const absolute = start + index;
				const id = String(rows[absolute]?.id ?? absolute);
				const isActive = id === activeKey;
				button.classList.toggle("str-rowActive", isActive);
				button.classList.toggle("str-rowBusy", busy && absolute === rows.length - 1);
			});
			const back = railDom.backRow;
			if (back !== null && list.lastChild !== back) list.appendChild(back);
		}

		/** Which topic covers the turn at the top of the viewport. */
		function railMeasure() {
			railDom.measureFrame = null;
			const scroller = chatScroller();
			if (scroller === null) return;
			const rows = scroller.querySelectorAll("[data-chat-turn]:not([hidden])");
			const top = scroller.getBoundingClientRect().top;
			const bottom = top + scroller.clientHeight;
			let current = null;
			for (const row of rows) {
				const rect = row.getBoundingClientRect();
				if (rect.top >= bottom) break;
				if (rect.bottom <= top + 8) continue;
				const value = Number(row.getAttribute("data-chat-turn"));
				if (Number.isSafeInteger(value)) current = value;
			}
			if (current === null) return;
			let match = null;
			for (const topic of railRows()) {
				const start = topic.startTurn;
				const span = Math.max(1, topic.turnCount || 1);
				if (current >= start && current < start + span) {
					match = topic.id;
					break;
				}
				if (current >= start) match = topic.id;
			}
			if (match === railDom.activeId) return;
			railDom.activeId = match;
			// The capsule shows a fixed window of rows around the active
			// topic, so a new active row may fall outside it — rebuild.
			const activeIndex = railRows().findIndex((topic, index) => String(topic.id ?? index) === String(match));
			// Rebuild only when the new active row is outside the rendered slice;
			// re-rendering on every scroll would reset the expanded scrollTop.
			if (activeIndex >= 0 && railDom.windowStart != null && railDom.sliceSize != null) {
				const start = railDom.windowStart;
				const end = start + railDom.sliceSize;
				if (activeIndex < start || activeIndex >= end) {
					railRender();
					return;
				}
			}
			railApplyState();
		}

		function railScheduleMeasure() {
			if (railDom.measureFrame !== null) return;
			railDom.measureFrame = requestAnimationFrame(railMeasure);
		}

		function railSetTopics(topics, phase) {
			railDom.topics = Array.isArray(topics) ? topics : [];
			if (phase !== undefined) railDom.phase = phase;
			// Topic lists written before timestamps existed carry no date column.
			// Ask the Host once per session to fill them from the raw log; the
			// reply arrives as a normal SSE topics broadcast.
			if (railDom.topics.length > 0 && railDom.topics.some((topic) => topic.startedAt === undefined)) {
				const sessionId = railDom.sessionId;
				if (sessionId !== null && sessionId !== undefined) {
					const key = String(sessionId);
					if (!railDom.restamped.has(key)) {
						railDom.restamped.add(key);
						post("restamp", { sessionId }).catch(() => { /* best effort */ });
					}
				}
			}
			try {
				post("rail-mount", { stage: "rail-topics", sessionId: railDom.sessionId ?? null, n: railDom.topics.length });
			} catch { /* diagnostics only */ }
			railRender();
		}

		/** Point the rail at a session: fresh SSE feed + initial fetch. */
		function railSubscribe(sessionId) {
			railDom.sessionId = sessionId;
			railDom.topics = [];
			railDom.activeId = null;
			if (railDom.source !== null) {
				railDom.source.close();
				railDom.source = null;
			}
			railRender();
			post("rail-mount", { stage: "rail-session", sessionId });
			const source = new EventSource(`${ROUTE}events?sessionId=${encodeURIComponent(sessionId)}`);
			source.onmessage = (event) => {
				try {
					const payload = JSON.parse(event.data);
					if (payload.kind === "topics" && payload.sessionId === sessionId) {
						railSetTopics(payload.topicList?.topics ?? []);
					} else if (payload.kind === "status" && payload.sessionId === sessionId) {
						railDom.phase = payload.status?.phase ?? "idle";
						railApplyState();
					}
				} catch {
					/* ignore malformed frames */
				}
			};
			source.onerror = () => {
				/* EventSource reconnects on its own */
			};
			railDom.source = source;
			api(`topics?sessionId=${encodeURIComponent(sessionId)}`)
				.then((data) => {
					if (railDom.sessionId !== sessionId) return;
					railSetTopics(data?.topicList?.topics ?? []);
				})
				.catch(() => {
					/* rail stays empty until the SSE feed delivers */
				});
		}

		function railSetSession(sessionId) {
			if (sessionId == null || sessionId === railDom.sessionId) return;
			railSubscribe(sessionId);
		}

		/**
		 * Start the rail once: build the frame, wire listeners, keep it alive.
		 * Called from apply(); session switches are pushed by the tool-row slot's
		 * focusedSessionId and re-checked on every keepalive tick.
		 */
		let railDelayTimer = null;

		/**
		 * Vertically re-center the rail. Centring belongs to CSS (top:50% +
		 * translateY(-50%)) so the tick column never drifts when a session
		 * switches or the capsule collapses; this only clears a stale inline top
		 * left behind by an older build.
		 */
		/**
		 * Anchor the rail to the conversation pane's right edge, not the window's.
		 *
		 * The right sidebar (and its拆分 panels) shrink the conversation instead of
		 * overlaying it, so a window-fixed strip would float on top of the sidebar
		 * as soon as it opens. `--str-right` carries the measured gap between the
		 * conversation pane and the window edge; with the sidebar closed it stays
		 * at the 12px resting offset.
		 */
		function railPosition() {
			const frame = railDom.frame;
			if (frame === null) return;
			frame.style.top = "";
			frame.style.transform = "";
			const scroller = typeof chatScroller === "function" ? chatScroller() : null;
			let right = 12;
			if (scroller !== null) {
				try {
					const rect = scroller.getBoundingClientRect();
					if (rect.width > 0) right = Math.max(12, Math.round(window.innerWidth - rect.right) + 12);
				} catch {
					right = 12;
				}
			}
			frame.style.setProperty("--str-right", right + "px");
			if (frame.offsetHeight === 0 && railRows().length > 0 && !railDom.hidden) frame.style.display = "";
		}


		/** How many rows fit once expanded — 56vh of 38px rows, like workbuddy. */
		function railExpandRows() {
			const hoverRow = railHoverRowHeight();
			const budget = Math.max(240, Math.round(window.innerHeight * 0.56) - railHoverChrome());
			return Math.max(3, Math.floor(budget / hoverRow));
		}
	/** Topic id of the row under a viewport Y, if any. */
		function railAnchorTopicIdAt(clientY) {
			const list = railDom.list;
			if (list === null) return null;
			for (const row of list.children) {
				const rect = row.getBoundingClientRect();
				if (clientY < rect.top) break;
				if (clientY < rect.bottom) return row.dataset?.topicId ?? null;
			}
			return null;
		}

		/** Row height while expanded — read from CSS so it can never drift. */
		function railHoverRowHeight() {
			const styles = railDom.list === null ? null : getComputedStyle(railDom.list);
			const parsed = styles === null ? NaN : Number.parseFloat(styles.getPropertyValue("--str-row-hover"));
			return Number.isFinite(parsed) && parsed > 0 ? parsed : 34;
		}

		/** Extra vertical chrome (list padding + border) gained on hover. */
		function railHoverChrome() {
			const styles = railDom.list === null ? null : getComputedStyle(railDom.list);
			const parsed = styles === null ? NaN : Number.parseFloat(styles.getPropertyValue("--str-list-hover-pad"));
			return Number.isFinite(parsed) && parsed >= 0 ? parsed : 6;
		}

		function railClearDelays() {
			railDelayTimer = null;
			if (railDom.list === null) return;
			for (const child of railDom.list.children) {
				child.style.transitionDelay = "";
				for (const span of child.children) span.style.transitionDelay = "";
			}
		}

		/**
		 * Cursor-anchored expansion: the row under the mouse when it enters the
		 * rail never moves — the frame top shifts up by exactly the growth of
		 * the rows above it, and the ripple of delays starts at that row, so
		 * nothing ever escapes the cursor.
		 */
		/**
		 * Open the capsule — workbuddy's transaction, ported.
		 *
		 * The old implementation set scrollTop 560 ms after the animation, which
		 * made the whole list visibly travel upwards and then settle back. The
		 * correct order is the reverse: compute the target scrollTop with the
		 * EXPANDED geometry, write it BEFORE the class lands (instantly, with the
		 * transition suppressed), and let the height/width transition be the only
		 * thing that animates. That is why workbuddy's rows never slide.
		 */
		function railOpen(anchorId) {
			const frame = railDom.frame;
			if (frame === null || railDom.expanded) return;
			const target = anchorId ?? railDom.hoverAnchor ?? railDom.activeId;
			railDom.expanded = true;
			// 1. Grow the slice to the expanded capacity so the DOM already holds
			//    every row the open window can show.
			railRender(railDom.hoverAnchor ?? undefined);
			// 2. Solve the scroll position against expanded geometry, then write it
			//    in the SAME frame while the row transition is disabled.
			const list = railDom.list;
			if (list !== null) {
				list.classList.add("str-jump");
				const rowHover = railHoverRowHeight();
				const domRows = Array.from(list.children).filter((child) => child.dataset?.topicId != null);
				let index = domRows.findIndex((child) => child.dataset.topicId === String(target ?? ""));
				if (index < 0) index = domRows.length - 1;
				if (index >= 0) {
					const paddingTop = Number.parseFloat(getComputedStyle(list).paddingTop) || 0;
					const rowCenter = paddingTop + index * rowHover + rowHover / 2;
					const expandedHeight = rowHover * railExpandRows() + 12;
					const maxScroll = Math.max(0, list.scrollHeight - expandedHeight);
					const centred = Math.max(0, Math.min(maxScroll, rowCenter - expandedHeight / 2));
					list.scrollTop = centred;
					try {
						post("rail-mount", { stage: "rail-open", index, rowCenter, centred, maxScroll, expandedHeight, anchor: target ?? null });
					} catch { /* diagnostics only */ }
				}
				// Re-enable transitions on the next frame so the height animation
				// still runs while the scroll position is already final.
				requestAnimationFrame(() => {
					list.classList.remove("str-jump");
					frame.classList.add("str-open");
				});
			} else {
				frame.classList.add("str-open");
			}
		}

		/** Close the capsule and put the rail back at its resting position. */
				/** Close the capsule and put the rail back at its resting position. */
		function railClose() {
			if (railDom.frame === null) return;
			railDom.expanded = false;
			railDom.hoverTop = null;
			railDom.hoverAnchor = null;
			if (railDom.pendingTimer !== null) {
				clearTimeout(railDom.pendingTimer);
				railDom.pendingTimer = null;
			}
			railDom.pendingScrollTop = null;
			// Collapse with the list pinned at the top of its window so the visible
			// slice cannot slide while the height animates.
			if (railDom.list !== null) {
				railDom.list.classList.remove("str-jump");
				railDom.list.style.removeProperty("--str-scroll-offset");
				// Pin the collapsed strip to the top of its window: the slice is
				// taller than the closed height, so a leftover scrollTop would show
				// a middle slice and read as "content moved up".
				railDom.list.scrollTop = 0;
			}
			railDom.frame.classList.remove("str-open");
			railPosition();
			railScheduleMeasure();
		}


		/** Scroll the expanded window so the focus row (anchor, else active) is
		 *  visible and vertically centred — workbuddy centres it too. */
		function railFocusActive(anchorId) {
			const list = railDom.list;
			if (list === null) return;
			const wanted = anchorId ?? railDom.activeId;
			if (wanted == null) return;
			const row = list.querySelector(`[data-topic-id="${railCssEscape(String(wanted))}"]`);
			if (row === null) return;
			const top = row.offsetTop - list.offsetTop;
			const maxScroll = Math.max(0, list.scrollHeight - list.clientHeight);
			list.scrollTop = Math.max(0, Math.min(maxScroll, top - (list.clientHeight - row.offsetHeight) / 2));
		}


		/**
		 * Hover intents, mirrored from workbuddy: 60 ms before opening, 180 ms
		 * before closing, so a diagonal mouse path does not flash the capsule.
		 * Both the frame and the list open it — the list is the node that always
		 * sits under the cursor, even after the frame gets re-parented.
		 */
		function railBindHover() {
			const frame = railDom.frame;
			if (frame === null) return;
			let openTimer = null;
			let closeTimer = null;
			const cancelOpen = () => {
				if (openTimer !== null) clearTimeout(openTimer);
				openTimer = null;
			};
			const cancelClose = () => {
				if (closeTimer !== null) clearTimeout(closeTimer);
				closeTimer = null;
			};
			const enter = (event) => {
				railDom.lastPointerY = event.clientY;
				railDom.hoverAnchor = railAnchorTopicIdAt(event.clientY);
				cancelClose();
				if (railDom.expanded || openTimer !== null) return;
				openTimer = setTimeout(() => {
					openTimer = null;
					try {
						railOpen(railAnchorTopicIdAt(railDom.lastPointerY ?? event.clientY));
					} catch (error) {
						try {
							post("rail-mount", { stage: "hover-open-error", message: String(error && error.message ? error.message : error) });
						} catch { /* diagnostics only */ }
					}
				}, 60);
			};
			frame.addEventListener("pointerenter", enter);
			if (railDom.list !== null) railDom.list.addEventListener("pointerenter", enter);
			frame.addEventListener("pointermove", (event) => {
				railDom.lastPointerY = event.clientY;
			});
			const leave = () => {
				cancelOpen();
				if (!railDom.expanded || closeTimer !== null) return;
				closeTimer = setTimeout(() => {
					closeTimer = null;
					railClose();
				}, 180);
			};
			frame.addEventListener("pointerleave", leave);
			if (railDom.list !== null) railDom.list.addEventListener("pointerleave", leave);
			frame.addEventListener("keydown", (event) => {
				if (event.key === "Escape") railClose();
			});
		}

		function railStart(opts) {
			if (railDom.started) return;
			if (typeof window !== "undefined" && typeof window.__DSH_TOPIC_RAIL_STOP__ === "function") {
				try {
					window.__DSH_TOPIC_RAIL_STOP__();
				} catch {}
			}
			railDom.started = true;
			railDom.opts = opts;
			const mount = () => {
				if (document.body === null) {
					setTimeout(mount, 300);
					return;
				}
				ensureRailStyle();
			// Structure mirrors workbuddy's conversation-history-navigation:
			// panel-outer (fixed box) > surface (the frosted capsule, grown via
			// inset()) + panel (clip-path window that slides open) > list.
			const frame = document.createElement("div");
			frame.className = "str-frame";
			const surface = document.createElement("div");
			surface.className = "str-surface";
			const panel = document.createElement("div");
			panel.className = "str-panel";
			const list = document.createElement("div");
			list.className = "str-list";
			panel.appendChild(list);
			frame.append(surface, panel);
			railDom.surface = surface;
			railDom.panel = panel;
			document.body.appendChild(frame);
			for (const other of document.querySelectorAll(".str-frame")) {
				if (other !== frame) other.remove();
			}
			railDom.frame = frame;
				railDom.list = list;
				railRender();
				railSetSession(opts.currentSessionId?.());
				railBindHover();
				post("rail-mount", { stage: "rail-start", href: String(window.location?.href ?? "") });
			};
			mount();
			document.addEventListener("scroll", railScheduleMeasure, { passive: true, capture: true });
			window.addEventListener("resize", railScheduleMeasure);
			window.addEventListener("resize", railPosition);
			// One place decides the rail's visibility: the frame, the native-strip
			// suppression flag and the open capsule all follow it.
			const syncHidden = () => {
				railDom.hidden = Boolean(opts.getHidden?.());
				if (railDom.hidden && railDom.expanded) railClose();
				railApplyNative();
				railRender();
				railPosition();
				railDom.burstResync?.();
			};
			if (typeof opts.subscribeHidden === "function") {
				opts.subscribeHidden(syncHidden);
			}
			railDom.syncHidden = syncHidden;
			syncHidden();
			railDom.keepalive = setInterval(() => {
				if (railDom.frame !== null && !railDom.frame.isConnected) {
					document.body.appendChild(railDom.frame);
					railDom.reappends += 1;
					post("rail-mount", { stage: "rail-keepalive", reappends: railDom.reappends });
				}
				if (railDom.frame !== null) {
					for (const other of document.querySelectorAll(".str-frame")) {
						if (other !== railDom.frame) other.remove();
					}
				}
				if (document.getElementById("str-rail-style") === null) {
					railStyleReady = false;
					ensureRailStyle();
				}
				railSetSession(railDom.opts?.currentSessionId?.());
				railMeasure();
			}, 2000);
			if (typeof window !== "undefined") window.__DSH_TOPIC_RAIL_STOP__ = railStop;
		}

		/**
		 * Full teardown so a hot-reloaded module instance never leaks its rail
		 * frame, style element, listeners, SSE stream or keepalive interval
		 * (every reload used to leave one extra rail behind).
		 */
		function railStop() {
			if (railDom.keepalive !== null) {
				clearInterval(railDom.keepalive);
				railDom.keepalive = null;
			}
			if (railDom.source !== null) {
				railDom.source.close();
				railDom.source = null;
			}
			document.removeEventListener("scroll", railScheduleMeasure, { capture: true });
			window.removeEventListener("resize", railScheduleMeasure);
			window.removeEventListener("resize", railPosition);
			if (railDom.frame !== null) {
				railDom.frame.remove();
				railDom.frame = null;
			}
			if (railDom.pendingTimer !== null) {
				clearTimeout(railDom.pendingTimer);
				railDom.pendingTimer = null;
			}
			railDom.pendingScrollTop = null;
			railDom.list = null;
			railDom.backRow = null;
			railDom.sessionId = null;
			railDom.activeId = null;
			railDom.started = false;
			railStyleReady = false;
			railDom.syncHidden = null;
			try {
				document.documentElement.removeAttribute("data-str-rail-on");
			} catch { /* document torn down */ }
			document.getElementById("str-rail-style")?.remove();
			if (typeof window !== "undefined" && window.__DSH_TOPIC_RAIL_STOP__ === railStop) {
				window.__DSH_TOPIC_RAIL_STOP__ = undefined;
			}
		}

		// TEMP DIAGNOSTIC: component-independent sampler. Runs from apply() for
		// 3 minutes, logging rail + DOM state every 2s. Remove once the fix is
		// confirmed on a full restart.
		let railSamplerStarted = false;
		let inputLeftFired = false; // one-shot inputLeft render probe
		function startRailSampler() {
			if (railSamplerStarted) return;
			railSamplerStarted = true;
			let ticks = 0;
			const timer = setInterval(() => {
				ticks += 1;
				try {
					const native = document.querySelector("._4if9eW_frame");
					post("rail-mount", {
						stage: "sampler",
						tick: ticks,
						railAlive: railDom.frame === null ? null : railDom.frame.isConnected,
						railHidden: railDom.hidden,
						topics: railRows().length,
						ourFrames: document.querySelectorAll(".str-frame").length,
						styleEl: document.getElementById("str-rail-style") !== null,
						nativeDisplay: native === null ? null : getComputedStyle(native).display,
						turnTailEls: document.querySelectorAll("[data-turn-tail]").length,
						chatTurns: document.querySelectorAll("[data-chat-turn]").length,
						toolBtn: document.querySelectorAll("[data-session-topics-tool]").length,
					});
				} catch { /* diagnostics only */ }
				if (ticks >= 90) clearInterval(timer);
			}, 2000);
		}
		return {
			inject: ["locale", "sessions", "uiWorkspace", "slots", "layout"],
			apply(ctx) {
				try {
					fetch("/plugins/session-topics/rail-mount", {
						method: "POST",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify({ stage: "apply", at: Date.now() }),
					}).catch(() => {});
				} catch { /* diagnostics only */ }
				startRailSampler(); // TEMP DIAGNOSTIC: component-independent sampler
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


			// The right-edge rail: self-owned DOM, kept alive by its own loop (see
			// the rail DOM section above). Hidden while the side card is open so
			// the two entry points never fight for the edge.
			// The side card can open/close by clicks inside the dock, not only
			// through our button, so the rail keeps its own poll of the real dock
			// layout: the moment our tab appears the rail yields the edge.
			// Tracking the conversation pane's right edge.
			//
			// Polling harder would burn CPU: every tick reads a rect (forced
			// layout) and calls tabsIn (allocates an array). Instead the watch is
			// event-driven — ResizeObserver on the pane catches dock open/close
			// and splitter drags with no timer at all — and the timer only runs
			// as a short burst while the pane is animating, since a CSS transition
			// moves the element without firing ResizeObserver on every frame.
			let paneObserver = null;
			let paneTarget = null;
			const paneEdge = () => {
				const scroller = typeof chatScroller === "function" ? chatScroller() : null;
				const rect = scroller?.getBoundingClientRect?.();
				if (rect === undefined) return null;
				return Math.round(window.innerWidth - rect.right);
			};
			const resyncRail = () => {
				try {
					setOpenFlag(isTopicsTabOpen());
				} catch { /* sidebar not ready */ }
				const edge = paneEdge();
				if (edge !== null) railPosition();
			};
			let burst = 0;
			const burstTick = () => {
				resyncRail();
				if (burst > 0) {
					burst -= 1;
					requestAnimationFrame(burstTick);
					return;
				}
				burstTimer = null;
			};
			let burstTimer = null;
			const burstResync = () => {
				burst = 24; // ~400ms of per-frame tracking, then idle
				if (burstTimer === null) burstTimer = requestAnimationFrame(burstTick);
			};
			railDom.burstResync = burstResync;
			try {
				paneTarget = typeof chatScroller === "function" ? chatScroller() : null;
				if (paneTarget !== null && typeof ResizeObserver === "function") {
					paneObserver = new ResizeObserver(() => burstResync());
					paneObserver.observe(paneTarget);
				}
			} catch { /* observer unavailable */ }
			// Slow safety net for the cases ResizeObserver cannot see (the pane
			// element being replaced on a session switch, tab list churn).
			const openWatch = setInterval(resyncRail, 1000);
			try {
				ctx.effect(
					() => () => {
						clearInterval(openWatch);
						if (burstTimer !== null) cancelAnimationFrame(burstTimer);
						burstTimer = null;
						paneObserver?.disconnect?.();
						paneObserver = null;
						railDom.burstResync = null;
					},
					"session-topics: rail edge watch",
				);
			} catch {
				/* effect unavailable in this shell */
			}

			railStart({
				t,
				loadThrough,
				// Hidden while the side card is open (the two entry points never
				// fight for the edge) or when the user switched the rail off.
				getHidden: () => openValue || prefsState.value.enableRail === false,
				subscribeHidden: (listener) => {
					openListeners.add(listener);
					const off = prefsStore.subscribe(listener);
					return () => {
						openListeners.delete(listener);
						off();
					};
				},
				currentSessionId,
			});
			// Seed the switches from the Host and keep the sections live.
			refreshPrefs();
			try {
				ctx.effect(() => () => railStop());
			} catch {}

				ctx.slots.inject("conversation.input.left", () => {
					post("rail-mount", { stage: "lifecycle", slot: "inputLeft", op: "inject-callback" });
					const inner = ctx.slots.register(
						{
							name: "conversation.input.left",
							id: "session-topics",
							order: 20,
						},
						(props) => {
							const sid = props?.session?.sessionId ?? props?.sessionId;

							if (sid != null) {
								focusedSessionId = sid;
								railSetSession(sid);
							}
							if (!inputLeftFired) {
								inputLeftFired = true;
								try {
									post("rail-mount", { stage: "inputleft-render", sid: sid ?? null, at: Date.now() });
								} catch { /* diagnostics only */ }
							}
							// The sidebar entry point is switchable: the slot stays
							// registered and simply renders nothing when it is off,
							// which keeps the ledger stable across toggles.
							if (usePrefs().enableSidebar === false) return null;
							return h(ToolRowEntry, { t, toggle: toggleTopics, useOpenFlag });
						},
					);
					return () => {
						post("rail-mount", { stage: "lifecycle", slot: "inputLeft", op: "entry-dispose" });
						try { inner(); } catch { /* diagnostics only */ }
					};
				});

				// The "Session topics" settings pane, registered through the same
				// section slot the shell uses for its own built-in plugin pages.
				try {
					ctx.slots.inject("settings.section", () =>
						ctx.slots.register(
							{
								name: "settings.section",
								id: "session-topics",
								order: 60,
								label: () => t("settings.title"),
								// Same glyph as the composer button, so the settings
								// section and the sidebar entry point read as one
								// feature instead of a stray gear.
								icon: (size) => IconTopics(size),
								locale: NS,
							},
							() => h(SessionTopicsSection, { t }),
						),
					);
				} catch (error) {
					post("rail-mount", { stage: "settings-section-error", message: String(error && error.message ? error.message : error) });
				}

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

				// The sidebar tab is registered only while the switch is on, so
				// Better Sidebar's own tab list (and its settings) never shows a
				// tab the user turned off. Toggling re-registers through the same
				// effect lifetime.
				let disposeTab = null;
				const syncTab = () => {
					const wanted = prefsState.value.enableSidebar !== false;
					if (wanted && disposeTab === null) {
						disposeTab = betterSidebar.registerTab({
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
						});
						return;
					}
					if (!wanted && disposeTab !== null) {
						try {
							disposeTab();
						} catch {
							/* already disposed */
						}
						disposeTab = null;
						setOpenFlag(false);
						try {
							betterSidebar.closeTab?.("session-topics");
						} catch {
							/* nothing open */
						}
					}
				};
				ctx.effect(
					() => {
						syncTab();
						const off = prefsStore.subscribe(syncTab);
						return () => {
							off();
							if (disposeTab !== null) {
								try {
									disposeTab();
								} catch {
									/* already disposed */
								}
								disposeTab = null;
							}
						};
					},
					"session-topics: better-sidebar tab",
				);
			},
		};
	},
});
