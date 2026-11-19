/**
 * Session Topics — Host half.
 *
 * Maintains an LLM-summarized topic index per session:
 * - incremental fold after every completed turn (`session/event` → `turn/end`);
 * - backfill of the most recent existing sessions once the plugin activates;
 * - keyword search plus LLM semantic re-ranking across all summarized sessions;
 * - an HTTP route (`/plugins/session-topics/`) with SSE push for the Client tab.
 *
 * The session log stays the only source of truth; the topic list is a derived
 * cache persisted through `ctx.storageDomain` keyed by session id.
 *
 * This module imports nothing: the plugin directory is linked into the profile
 * without its own node_modules, so zod-style schemas, the domain spec, and the
 * stream assembler are hand-rolled minimal equivalents.
 */

const name = "session-topics";
const ROUTE = "/plugins/session-topics";
const COLD_START_FULL_TURNS = 50;
const COLD_START_SHORT_CHARS = 80;

// ---------- minimal zod-compatible schema ----------

function makeSchema(validate) {
	return {
		parse(value) {
			const outcome = validate(value);
			if (!outcome.ok) throw new Error(outcome.message);
			return value;
		},
		safeParse(value) {
			const outcome = validate(value);
			return outcome.ok ? { success: true, data: value } : { success: false, error: new Error(outcome.message) };
		},
	};
}

function isNonNegativeInteger(value) {
	return Number.isSafeInteger(value) && value >= 0;
}

function validateTopic(value) {
	if (typeof value !== "object" || value === null) return { ok: false, message: "topic must be an object" };
	if (typeof value.id !== "string" || value.id.length === 0) return { ok: false, message: "topic.id must be a non-empty string" };
	if (typeof value.title !== "string" || value.title.length === 0) return { ok: false, message: "topic.title must be a non-empty string" };
	if (typeof value.summary !== "string") return { ok: false, message: "topic.summary must be a string" };
	if (!isNonNegativeInteger(value.startSeq)) return { ok: false, message: "topic.startSeq must be a non-negative integer" };
	if (!isNonNegativeInteger(value.endSeq)) return { ok: false, message: "topic.endSeq must be a non-negative integer" };
	if (!isNonNegativeInteger(value.startTurn)) return { ok: false, message: "topic.startTurn must be a non-negative integer" };
	if (!isNonNegativeInteger(value.turnCount)) return { ok: false, message: "topic.turnCount must be a non-negative integer" };
	if (value.status !== "active" && value.status !== "closed") return { ok: false, message: "topic.status must be active or closed" };
	if (!isNonNegativeInteger(value.updatedAt) && value.updatedAt !== undefined) {
		return { ok: false, message: "topic.updatedAt must be a non-negative integer" };
	}
	if (!isNonNegativeInteger(value.startedAt) && value.startedAt !== undefined) {
		return { ok: false, message: "topic.startedAt must be a non-negative integer" };
	}
	return { ok: true };
}

const TopicListSchema = makeSchema((value) => {
	if (typeof value !== "object" || value === null) return { ok: false, message: "topic list must be an object" };
	if (value.version !== 1) return { ok: false, message: "topic list version must be 1" };
	if (!isNonNegativeInteger(value.summarizedThrough)) return { ok: false, message: "summarizedThrough must be a non-negative integer" };
	if (!Array.isArray(value.topics)) return { ok: false, message: "topics must be an array" };
	for (const topic of value.topics) {
		const outcome = validateTopic(topic);
		if (!outcome.ok) return outcome;
	}
	return { ok: true };
});

/** User-editable summarizer override stored in the plugin's own domain. */
const SummarizerConfigSchema = makeSchema((value) => {
	if (typeof value !== "object" || value === null) return { ok: false, message: "config must be an object" };
	if (value.provider !== undefined && (typeof value.provider !== "string" || value.provider.length === 0)) {
		return { ok: false, message: "config.provider must be a non-empty string" };
	}
	if (value.model !== undefined && (typeof value.model !== "string" || value.model.length === 0)) {
		return { ok: false, message: "config.model must be a non-empty string" };
	}
	return { ok: true };
});

/** Domain spec in the exact shape `ctx.storageDomain.open` consumes. */
const topicsDomainSpec = {
	name: "session_topics",
	version: 1,
	tables: {
		topics: { valueSchema: TopicListSchema },
		config: { valueSchema: SummarizerConfigSchema },
	},
};

// ---------- minimal stream assembler ----------

function createStreamAggregator() {
	const parts = [];
	let finish;
	return {
		push(chunk) {
			if (chunk === undefined || chunk === null) return;
			if (chunk.type === "text-delta" && typeof chunk.text === "string") parts.push(chunk.text);
			else if (chunk.type === "finish") finish = chunk.reason;
		},
		get finish() {
			return finish;
		},
		text() {
			return parts.join("");
		},
	};
}

// ---------- config normalization ----------

function normalizeConfig(raw) {
	const value = typeof raw === "object" && raw !== null ? raw : {};
	const summarizer = typeof value.summarizer === "object" && value.summarizer !== null ? value.summarizer : {};
	const provider = typeof summarizer.provider === "string" ? summarizer.provider.trim() : "";
	const model = typeof summarizer.model === "string" ? summarizer.model.trim() : "";
	const clamp = (input, min, max, fallback) => {
		const parsed = Number(input);
		return Number.isSafeInteger(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
	};
	return {
		summarizer: { provider, model },
		enableRail: value.enableRail !== false,
		enableSidebar: value.enableSidebar !== false,
		autoUpdate: value.autoUpdate !== false,
		maxTopics: clamp(value.maxTopics, 3, 100, 20),
		assistantExcerptChars: clamp(value.assistantExcerptChars, 100, 8000, 500),
		language: value.language === "zh" || value.language === "en" ? value.language : "auto",
		initBackfillCount: clamp(value.initBackfillCount, 0, 100, 10),
		searchResultLimit: clamp(value.searchResultLimit, 5, 200, 50),
		semanticCandidateLimit: clamp(value.semanticCandidateLimit, 10, 500, 100),
	};
}

export const inject = ["sessionQuery", "llm", "storageDomain", "webServer", "connection"];

export function apply(ctx, rawConfig) {
	const config = normalizeConfig(rawConfig);
	if (config.summarizer.provider.length === 0 || config.summarizer.model.length === 0) {
		throw new Error("session-topics: config.summarizer.provider and config.summarizer.model are required");
	}

	/** @type {{ get(key: string): any, put(key: string, value: any): Promise<void>, entries(): IterableIterator<[string, any]> } | null} */
	let table = null;
	let configTable = null;
	const status = new Map();
	const queue = [];
	let pumping = false;
	const backfill = { active: false, total: 0, done: 0, paused: false };
	const sseClients = new Set();

	// ---------- push ----------

	function broadcast(payload, sessionId) {
		for (const client of sseClients) {
			if (client.sessionId !== "*" && client.sessionId !== sessionId) continue;
			try {
				client.res.write(`data: ${JSON.stringify(payload)}\n\n`);
			} catch {
				/* dropped client; close handler removes it */
			}
		}
	}

	function setStatus(sessionId, phase, error) {
		const record = { phase, error: error ?? null, at: Date.now() };
		status.set(sessionId, record);
		broadcast({ kind: "status", sessionId, status: record }, sessionId);
	}

	function broadcastBackfill() {
		broadcast({ kind: "backfill", backfill: { ...backfill } }, "*");
	}

	// ---------- cache ----------

	function cachedList(sessionId) {
		if (table === null) return undefined;
		let value;
		try {
			value = table.get(sessionId);
		} catch {
			return undefined;
		}
		if (value === undefined) return undefined;
		return TopicListSchema.safeParse(value).success ? value : undefined;
	}

	function allTopicEntries() {
		if (table === null) return [];
		try {
			return [...table.entries()];
		} catch {
			return [];
		}
	}

	// ---------- LLM ----------

	/** Effective summarizer route: the user's stored override wins over the patch config. */
	function effectiveSummarizer() {
		let override;
		try {
			override = configTable?.get("summarizer");
		} catch {
			override = undefined;
		}
		if (override !== undefined && SummarizerConfigSchema.safeParse(override).success) {
			return {
				provider: typeof override.provider === "string" && override.provider.length > 0 ? override.provider : config.summarizer.provider,
				model: typeof override.model === "string" && override.model.length > 0 ? override.model : config.summarizer.model,
			};
		}
		return config.summarizer;
	}

	/**
	 * Effective settings for the settings pane: manifest/patch defaults, then
	 * whatever the user stored through config-patch, then the summarizer route.
	 */
	function effectiveSettings() {
		let stored;
		try {
			stored = configTable?.get("settings");
		} catch {
			stored = undefined;
		}
		const merged = normalizeConfig({ ...config, ...(typeof stored === "object" && stored !== null ? stored : {}) });
		return {
			enableRail: merged.enableRail,
			enableSidebar: merged.enableSidebar,
			maxTopics: merged.maxTopics,
			initBackfillCount: merged.initBackfillCount,
			assistantExcerptChars: merged.assistantExcerptChars,
			searchResultLimit: merged.searchResultLimit,
			semanticCandidateLimit: merged.semanticCandidateLimit,
			language: merged.language,
			summarizer: effectiveSummarizer(),
		};
	}

	async function callSummarizer(systemText, userText) {
		const aggregator = createStreamAggregator();
		const route = effectiveSummarizer();
		const options = {
			provider: route.provider,
			model: route.model,
			messages: [
				{ role: "system", content: [{ type: "text", text: systemText }] },
				{ role: "user", content: [{ type: "text", text: userText }] },
			],
			maxTokens: 4096,
			purpose: name,
		};
		for await (const chunk of ctx.llm.stream(options)) aggregator.push(chunk);
		const finish = aggregator.finish;
		if (finish !== undefined && (finish.kind === "error" || finish.kind === "aborted")) {
			const failure = finish.failure;
			const detail =
				failure !== undefined
					? `: ${JSON.stringify({ code: failure.code, message: failure.message })}`
					: "";
			throw new Error(`summarizer stream ended with ${finish.kind}${detail}`);
		}
		const text = aggregator.text();
		if (text.trim().length === 0) throw new Error("summarizer produced no text");
		return text;
	}

	// ---------- excerpt ----------

	function textOf(message) {
		if (message === undefined || !Array.isArray(message.content)) return "";
		return message.content
			.filter((block) => block.type === "text" && typeof block.text === "string")
			.map((block) => block.text)
			.join("\n");
	}

	/** Epoch milliseconds of a session event, from whichever field the log carries. */
	function eventAt(event) {
		for (const candidate of [event?.time, event?.timestamp, event?.createdAt, event?.data?.time, event?.data?.timestamp, event?.data?.createdAt]) {
			if (typeof candidate === "number" && Number.isFinite(candidate) && candidate > 0) {
				return candidate > 1e12 ? Math.round(candidate) : Math.round(candidate * 1000);
			}
			if (typeof candidate === "string") {
				const parsed = Date.parse(candidate);
				if (Number.isFinite(parsed) && parsed > 0) return parsed;
			}
		}
		return undefined;
	}

	async function collectExcerpt(sessionId, fromSeq) {
		const snapshot = await ctx.sessionQuery.readSession(sessionId);
		const events = Array.isArray(snapshot?.events) ? snapshot.events : [];
		let lastSeq = fromSeq;
		let currentTurn = 0;
		const turns = [];
		let pending = null;
		for (const event of events) {
			if (event.type === "turn/start" || event.type === "turn/end") {
				const turn = event.data?.turn;
				if (Number.isSafeInteger(turn)) currentTurn = turn;
			}
			const seq = event?.seq;
			if (typeof seq !== "number" || seq <= fromSeq) continue;
			if (seq > lastSeq) lastSeq = seq;
			if (event.type === "user/message") {
				if (pending !== null) turns.push(pending);
				pending = {
					turn: currentTurn,
					startSeq: seq,
					userText: textOf(event.data),
					assistantText: "",
					tools: [],
					// First-seen timestamp for this exchange: the authoritative
					// clock for "when did this topic start", independent of the
					// model's own (untrusted) numbers.
					at: eventAt(event),
				};
			} else if (event.type === "assistant/message" && pending !== null) {
				if (pending.assistantText.length < config.assistantExcerptChars) {
					const text = textOf(event.data?.message);
					pending.assistantText = `${pending.assistantText}\n${text}`
						.trim()
						.slice(0, config.assistantExcerptChars);
				}
			} else if (event.type === "tool/call" && pending !== null) {
				const toolName = event.data?.name;
				if (typeof toolName === "string" && !pending.tools.includes(toolName)) {
					pending.tools.push(toolName);
				}
			}
		}
		if (pending !== null) turns.push(pending);
		if (turns.length > COLD_START_FULL_TURNS) {
			const older = turns.length - COLD_START_FULL_TURNS;
			for (let index = 0; index < older; index += 1) {
				turns[index].userText = turns[index].userText.slice(0, COLD_START_SHORT_CHARS);
				turns[index].assistantText = turns[index].assistantText.slice(0, COLD_START_SHORT_CHARS);
			}
		}
		// Every exchange's clock, not only the ones in this excerpt: an existing
		// topic list created before timestamps existed still needs its times
		// backfilled, and its exchanges are by definition not new ones.
		const allTimes = turns
			.filter((turn) => turn.at !== undefined)
			.map((turn) => ({ seq: turn.startSeq, turn: turn.turn, at: turn.at }));
		return { turns, lastSeq, allTimes };
	}

	// ---------- prompts ----------

	function languageInstruction() {
		if (config.language === "zh") return "Simplified Chinese";
		if (config.language === "en") return "English";
		return "the same language as the conversation";
	}

	function systemPrompt() {
		return [
			"You maintain a topic index for one AI-assistant chat session.",
			"The user message contains the current topic list and the new exchanges; you return the updated complete list.",
			"Rules:",
			"- Fold new exchanges into an existing topic when they continue its subject; keep that topic's id unchanged.",
			"- Create a new topic (fresh id like t1, t2, t3) only when the subject is clearly new.",
			"- Merge adjacent topics about the same subject; split a topic that drifted into distinct subjects.",
			"- Mark exactly one topic active: the one the latest exchange belongs to; every other topic closed.",
			`- title: at most 20 characters, in ${languageInstruction()}.`,
			`- summary: one or two sentences, at most 80 characters, in ${languageInstruction()}.`,
			"- Copy startSeq, endSeq and startTurn from the input markers; never invent or shift them.",
			"- Timestamps in the input markers are reference only; the host stamps times itself.",
			"- turnCount: how many user turns the topic covers.",
			`- Keep at most ${config.maxTopics} topics; drop the oldest closed ones first.`,
			'Output ONLY valid JSON of shape {"topics":[{"id":"","title":"","summary":"","startSeq":0,"endSeq":0,"startTurn":0,"turnCount":0,"status":"active|closed","updatedAt":0}]} — no markdown fences, no commentary.',
		].join("\n");
	}

	function userPrompt(current, turns) {
		const lines = turns.map((turn) => {
			const tools = turn.tools.length > 0 ? ` [tools: ${turn.tools.join(", ")}]` : "";
			return [
				`[turn ${turn.turn}, seq ${turn.startSeq}${turn.at !== undefined ? `, at ${new Date(turn.at).toISOString()}` : ""}] USER: ${turn.userText}`,
				`[turn ${turn.turn}] ASSISTANT${tools}: ${turn.assistantText}`,
			].join("\n");
		});
		return [
			`CURRENT TOPIC LIST (JSON): ${JSON.stringify(current.topics)}`,
			"",
			"NEW EXCHANGES:",
			lines.join("\n\n"),
			"",
			"Return the updated complete topic list as JSON.",
		].join("\n");
	}

	// ---------- parse & validate ----------

	/** Extract the outermost balanced JSON object, tolerating fences and trailing prose. */
	function extractJson(raw) {
		let text = String(raw).trim();
		const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
		if (fence !== null) text = fence[1];
		const start = text.indexOf("{");
		if (start < 0) throw new Error("summarizer output contains no JSON object");
		// Walk to the balanced close of the object opened at `start`.
		let depth = 0;
		let inString = false;
		let escaped = false;
		for (let index = start; index < text.length; index += 1) {
			const char = text[index];
			if (inString) {
				if (escaped) escaped = false;
				else if (char === "\\") escaped = true;
				else if (char === '"') inString = false;
				continue;
			}
			if (char === '"') inString = true;
			else if (char === "{") depth += 1;
			else if (char === "}") {
				depth -= 1;
				if (depth === 0) {
					const candidate = text.slice(start, index + 1);
					return tryParse(candidate) ?? tryParse(repair(candidate)) ?? JSON.parse(candidate);
				}
			}
		}
		// Unbalanced (truncated) output: repair the tail and parse what is there.
		const candidate = repair(text.slice(start));
		return JSON.parse(candidate);
	}

	function tryParse(text) {
		try {
			return JSON.parse(text);
		} catch {
			return undefined;
		}
	}

	/** Repair the common LLM JSON faults: trailing commas and smart quotes. */
	function repair(text) {
		return text
			.replace(/,\s*([}\]])/g, "$1")
			.replace(/[“”]/g, '"')
			.replace(/[‘’]/g, "'");
	}

	function parseTopics(raw, lastSeq) {
		const parsed = extractJson(raw);
		const rawTopics = Array.isArray(parsed.topics) ? parsed.topics : [];
		const now = Date.now();
		const cleaned = [];
		for (const candidate of rawTopics) {
			const topic = { ...candidate };
			const outcome = validateTopic(topic);
			if (!outcome.ok) continue;
			if (topic.endSeq < topic.startSeq) continue;
			if (topic.startSeq > lastSeq || topic.endSeq > lastSeq) continue;
			cleaned.push(topic);
		}
		if (cleaned.length === 0) throw new Error("summarizer output yielded no valid topics");
		const active = cleaned.filter((topic) => topic.status === "active");
		if (active.length > 1) {
			const keep = active.reduce((left, right) => (left.updatedAt >= right.updatedAt ? left : right));
			for (const topic of cleaned) {
				if (topic.status === "active" && topic !== keep) topic.status = "closed";
			}
		} else if (active.length === 0) {
			const newest = cleaned.reduce((left, right) => (left.updatedAt >= right.updatedAt ? left : right));
			newest.status = "active";
		}
		return cleaned.slice(0, config.maxTopics);
	}

	/**
	 * Stamp trustworthy updatedAt values: a topic whose content is unchanged
	 * from the previous list keeps its old stamp; changed or new topics get
	 * `now`. The model's own timestamps are never trusted.
	 */
	function stampTopics(newTopics, oldTopics, now, turnTimes) {
		const oldById = new Map(oldTopics.map((topic) => [topic.id, topic]));
		return newTopics.map((topic) => {
			const old = oldById.get(topic.id);
			const unchanged =
				old !== undefined &&
				old.title === topic.title &&
				old.summary === topic.summary &&
				old.endSeq === topic.endSeq &&
				old.turnCount === topic.turnCount &&
				old.status === topic.status;
			// startedAt = the wall clock of the exchange the topic began at. It
			// never moves once known: a topic that grows keeps its first stamp,
			// which is exactly what the rail's date column should show.
			let startedAt = old?.startedAt;
			const endTurn = topic.startTurn + Math.max(0, (topic.turnCount ?? 1) - 1);
			const fromTurns = earliestTurnTime(turnTimes, topic.startTurn, endTurn, topic.endSeq);
			if (startedAt === undefined && fromTurns !== undefined) startedAt = fromTurns;
			return { ...topic, updatedAt: unchanged ? old.updatedAt : now, startedAt };
		});
	}

	/**
	 * Earliest timestamp among the exchanges that belong to a topic.
	 *
	 * `turnTimes` maps sequence numbers to wall clocks collected while reading
	 * the session log. The topic's own `endSeq` bounds the walk so a topic can
	 * only take times from exchanges it actually covers, and `startTurn` lets a
	 * topic that begins mid-window still claim its own first exchange.
	 */
	function earliestTurnTime(turnTimes, startTurn, endTurn, endSeq) {
		if (!Array.isArray(turnTimes) || turnTimes.length === 0) return undefined;
		let best;
		let fallback;
		for (const entry of turnTimes) {
			if (Number.isSafeInteger(endSeq) && entry.seq > endSeq) continue;
			if (fallback === undefined || entry.at < fallback) fallback = entry.at;
			if (Number.isSafeInteger(startTurn) && entry.turn < startTurn) continue;
			if (Number.isSafeInteger(endTurn) && entry.turn > endTurn) continue;
			if (best === undefined || entry.at < best) best = entry.at;
		}
		// The model's startTurn can drift by a turn or two; when its window holds
		// no exchange at all, the earliest exchange up to endSeq is still a far
		// better answer than "no date".
		return best ?? fallback;
	}

	// ---------- summarize task ----------

	async function summarizeSession(sessionId, full) {
		let current = cachedList(sessionId);
		if (full || current === undefined) current = { version: 1, summarizedThrough: 0, topics: [] };
		const { turns, lastSeq, allTimes } = await collectExcerpt(sessionId, current.summarizedThrough);
		if (turns.length === 0) {
			// Nothing new, but an older topic list may predate timestamps: fill
			// what we can from the exchanges it covers, then persist once.
			const needsTime = current.topics.some((topic) => topic.startedAt === undefined);
			if (needsTime) {
				const backfilled = stampTopics(current.topics, current.topics, Date.now(), allTimes);
				await table.put(sessionId, { ...current, topics: backfilled });
				broadcast({ kind: "topics", sessionId, topicList: { ...current, topics: backfilled } }, sessionId);
				return;
			}
			if (lastSeq > current.summarizedThrough) {
				await table.put(sessionId, { ...current, summarizedThrough: lastSeq });
			}
			return;
		}
		const system = systemPrompt();
		const user = userPrompt(current, turns);
		let raw = await callSummarizer(system, user);
		let topics;
		try {
			topics = parseTopics(raw, lastSeq);
		} catch (error) {
			// One strict retry: tell the model its previous output was not valid JSON.
			raw = await callSummarizer(
				`${system}\n\nIMPORTANT: your previous reply was NOT valid JSON (${String(error?.message ?? error)}). Reply again with strictly valid JSON only — no comments, no trailing commas, no extra text.`,
				user,
			);
			topics = parseTopics(raw, lastSeq);
		}
		const stamped = stampTopics(topics, current.topics, Date.now(), allTimes);
		const next = { version: 1, summarizedThrough: lastSeq, topics: stamped };
		await table.put(sessionId, next);
		broadcast({ kind: "topics", sessionId, topicList: next }, sessionId);
	}

	// ---------- queue ----------

	function enqueue(task) {
		const existing = queue.find((item) => item.sessionId === task.sessionId);
		if (existing !== undefined) {
			existing.full = existing.full || task.full;
			return;
		}
		queue.push(task);
		void pump();
	}

	async function pump() {
		if (pumping) return;
		pumping = true;
		try {
			while (queue.length > 0) {
				const task = queue[0];
				if (task.backfill === true && backfill.paused) break;
				queue.shift();
				setStatus(task.sessionId, "summarizing");
				try {
					await summarizeSession(task.sessionId, task.full);
					setStatus(task.sessionId, "idle");
				} catch (error) {
					setStatus(task.sessionId, "error", String(error?.message ?? error));
				}
				if (task.backfill === true) {
					backfill.done += 1;
					broadcastBackfill();
				}
			}
		} finally {
			pumping = false;
		}
	}

	// ---------- session events ----------

	ctx.on("session/event", (session, event) => {
		if (config.autoUpdate !== true) return;
		if (event?.type !== "turn/end") return;
		enqueue({ sessionId: session.id, full: false });
	});

	// ---------- backfill ----------

	async function startBackfill() {
		if (backfill.active || config.initBackfillCount <= 0) return;
		backfill.active = true;
		try {
			const sessions = await ctx.sessionQuery.listSessions();
			const targets = sessions
				.slice(0, config.initBackfillCount)
				.map((record) => record?.header?.id)
				.filter((id) => typeof id === "string" && id.length > 0)
				.filter((id) => {
					const cached = cachedList(id);
					return cached === undefined || cached.summarizedThrough === 0;
				});
			backfill.total = targets.length;
			backfill.done = 0;
			for (const sessionId of targets) enqueue({ sessionId, full: true, backfill: true });
			broadcastBackfill();
		} catch {
			backfill.active = false;
		}
	}

	// ---------- search ----------

	function searchTopics(query, sessionId, limit) {
		const tokens = String(query ?? "")
			.toLowerCase()
			.split(/\s+/)
			.filter((token) => token.length > 0);
		if (tokens.length === 0) return [];
		const results = [];
		for (const [sid, list] of allTopicEntries()) {
			if (sessionId !== undefined && sid !== sessionId) continue;
			for (const topic of list.topics) {
				const title = topic.title.toLowerCase();
				const summary = topic.summary.toLowerCase();
				let score = 0;
				for (const token of tokens) {
					if (title.includes(token)) score += 3;
					if (summary.includes(token)) score += 1;
				}
				if (score > 0) results.push({ sessionId: sid, topic, score });
			}
		}
		results.sort((left, right) => right.score - left.score || right.topic.updatedAt - left.topic.updatedAt);
		return results.slice(0, limit);
	}

	function titleOf(snapshot, sessionId) {
		const value = snapshot?.title ?? snapshot?.text;
		return typeof value === "string" && value.length > 0 ? value : sessionId;
	}

	async function sessionTitles(sessionIds) {
		const titles = new Map();
		await Promise.all(
			[...new Set(sessionIds)].map(async (sessionId) => {
				try {
					const snapshot = await ctx.sessionQuery.readTitle(sessionId);
					if (snapshot !== undefined) titles.set(sessionId, snapshot);
				} catch {
					/* title unavailable */
				}
			}),
		);
		return titles;
	}

	async function semanticSearch(query) {
		const keyword = searchTopics(query, undefined, config.semanticCandidateLimit);
		let candidates = keyword;
		let titlesOnly = false;
		if (candidates.length === 0) {
			candidates = [];
			for (const [sid, list] of allTopicEntries()) {
				for (const topic of list.topics) candidates.push({ sessionId: sid, topic });
			}
			candidates = candidates.slice(0, config.semanticCandidateLimit);
			titlesOnly = true;
		}
		if (candidates.length === 0) return { results: [], note: "no-topics" };
		const system = [
			"You rank conversation topics against a search query by semantic relevance.",
			'Return ONLY valid JSON: {"hits":[{"sessionId":"","topicId":"","reason":""}]}.',
			"Include only genuinely relevant topics, best first, at most 10.",
			"reason: one short sentence in the query's language.",
		].join("\n");
		const payload = candidates.map((candidate) => ({
			sessionId: candidate.sessionId,
			topicId: candidate.topic.id,
			title: candidate.topic.title,
			...(titlesOnly ? {} : { summary: candidate.topic.summary }),
		}));
		const raw = await callSummarizer(system, `QUERY: ${query}\n\nCANDIDATES (JSON):\n${JSON.stringify(payload)}`);
		const parsed = extractJson(raw);
		const hits = Array.isArray(parsed.hits) ? parsed.hits : [];
		const byKey = new Map(candidates.map((candidate) => [`${candidate.sessionId}\u0000${candidate.topic.id}`, candidate]));
		const results = [];
		for (const hit of hits) {
			const candidate = byKey.get(`${hit.sessionId}\u0000${hit.topicId}`);
			if (candidate === undefined) continue;
			results.push({ sessionId: candidate.sessionId, topic: candidate.topic, reason: String(hit.reason ?? "") });
		}
		return { results, note: titlesOnly ? "titles-only" : "keyword-pool" };
	}

	// ---------- HTTP ----------

	async function readBody(req) {
		let body = "";
		for await (const chunk of req) body += chunk;
		try {
			return body.length > 0 ? JSON.parse(body) : {};
		} catch {
			return {};
		}
	}

	function jsonReply(res, code, value) {
		const text = JSON.stringify(value);
		res.writeHead(code, {
			"Content-Type": "application/json; charset=utf-8",
			"Content-Length": Buffer.byteLength(text),
		});
		res.end(text);
	}

	/**
	 * Apply DSH's own Host/Origin + browser-auth checks to this route.
	 *
	 * Without this, any web page open in the user's browser can call
	 * `/plugins/session-topics/*` cross-origin or from a same-site tab and read
	 * the topic list. `connection` is a core service; its reject verdict (401 or
	 * 403) is written straight back, and an absent service (older shells) leaves
	 * the route as it was.
	 */
	function rejectRequest(req, res) {
		const connection = Reflect.get(ctx, "connection");
		if (connection === undefined || typeof connection.requestRejection !== "function") return false;
		const rejection = connection.requestRejection(req);
		if (rejection === undefined) return false;
		res.statusCode = rejection;
		res.end();
		return true;
	}

	async function handle(req, res) {
		if (rejectRequest(req, res)) return;
		const url = new URL(req.url ?? "/", "http://local");
		const path = url.pathname
			.replace(/^\/plugins\/session-topics\/?/, "")
			.replace(/\/+$/, "");
		const method = req.method ?? "GET";
		try {
			if (method === "GET" && path === "topics") {
				const sessionId = url.searchParams.get("sessionId") ?? "";
				jsonReply(res, 200, {
					topicList: cachedList(sessionId) ?? null,
					status: status.get(sessionId) ?? { phase: "idle", error: null },
				});
				return;
			}
			if (method === "GET" && path === "events") {
				const sessionId = url.searchParams.get("sessionId") ?? "*";
				res.writeHead(200, {
					"Content-Type": "text/event-stream",
					"Cache-Control": "no-cache",
					Connection: "keep-alive",
				});
				const client = { res, sessionId };
				sseClients.add(client);
				const ping = setInterval(() => {
					try {
						res.write(": ping\n\n");
					} catch {
						/* dropped */
					}
				}, 20000);
				req.on("close", () => {
					clearInterval(ping);
					sseClients.delete(client);
				});
				res.write(`data: ${JSON.stringify({ kind: "hello", backfill: { ...backfill } })}\n\n`);
				return;
			}
			if (method === "POST" && (path === "refresh" || path === "resummarize")) {
				const body = await readBody(req);
				const sessionId = String(body.sessionId ?? "");
				if (sessionId.length === 0) {
					jsonReply(res, 400, { error: "sessionId required" });
					return;
				}
				enqueue({ sessionId, full: path === "resummarize" });
				jsonReply(res, 200, { ok: true });
				return;
			}
			if (method === "GET" && path === "search") {
				const query = url.searchParams.get("q") ?? "";
				const sessionId = url.searchParams.get("sessionId") ?? "";
				const results = searchTopics(query, sessionId.length > 0 ? sessionId : undefined, config.searchResultLimit);
				const titles = await sessionTitles(results.map((result) => result.sessionId));
				jsonReply(res, 200, {
					results: results.map((result) => ({
						sessionId: result.sessionId,
						sessionTitle: titleOf(titles.get(result.sessionId), result.sessionId),
						topic: result.topic,
					})),
				});
				return;
			}
			if (method === "POST" && path === "semantic-search") {
				const body = await readBody(req);
				const query = String(body.q ?? "");
				if (query.trim().length === 0) {
					jsonReply(res, 400, { error: "q required" });
					return;
				}
				const outcome = await semanticSearch(query);
				const titles = await sessionTitles(outcome.results.map((result) => result.sessionId));
				jsonReply(res, 200, {
					note: outcome.note,
					results: outcome.results.map((result) => ({
						sessionId: result.sessionId,
						sessionTitle: titleOf(titles.get(result.sessionId), result.sessionId),
						topic: result.topic,
						reason: result.reason,
					})),
				});
				return;
			}
			if (method === "POST" && path === "rail-mount") {
				const body = await readBody(req);
				const fs = globalThis.process?.getBuiltinModule?.("node:fs");
				const path = globalThis.process?.getBuiltinModule?.("node:path");
				const os = globalThis.process?.getBuiltinModule?.("node:os");
				if (fs !== undefined && path !== undefined && os !== undefined) {
					try {
						fs.appendFileSync(
							path.join(os.tmpdir(), "dsh-session-topics-rail.log"),
							`${new Date().toISOString()} ${JSON.stringify(body)}\n`,
						);
					} catch {
						/* diagnostics only */
					}
				}
				jsonReply(res, 200, { ok: true });
				return;
			}
			if (method === "POST" && path === "diagnostic") {
				const body = await readBody(req);
				const fs = globalThis.process?.getBuiltinModule?.("node:fs");
				if (fs !== undefined) {
					try {
						const path = globalThis.process?.getBuiltinModule?.("node:path");
						const os = globalThis.process?.getBuiltinModule?.("node:os");
						if (path !== undefined && os !== undefined) {
							fs.writeFileSync(
								path.join(os.tmpdir(), "dsh-session-topics-diagnostic.json"),
								JSON.stringify({ at: Date.now(), ...body }, null, 1),
							);
						}
					} catch {
						/* diagnostics only */
					}
				}
				jsonReply(res, 200, { ok: true });
				return;
			}
			if (method === "GET" && path === "models") {
				const providers = ctx.llm.listProviders();
				const catalog = [];
				for (const info of providers) {
					try {
						const models = await ctx.llm.listModels(info.id);
						catalog.push({
							provider: info.id,
							name: info.name,
							models: models.map((model) => ({ id: model.id, name: model.name })),
						});
					} catch {
						/* provider catalog unavailable */
					}
				}
				jsonReply(res, 200, { providers: catalog });
				return;
			}
			if (method === "GET" && path === "config") {
				jsonReply(res, 200, effectiveSettings());
				return;
			}
			if (method === "POST" && path === "config") {
				const body = await readBody(req);
				const candidate = {
					...(typeof body.provider === "string" ? { provider: body.provider.trim() } : {}),
					...(typeof body.model === "string" ? { model: body.model.trim() } : {}),
				};
				if (!SummarizerConfigSchema.safeParse(candidate).success) {
					jsonReply(res, 400, { error: "provider and model must be non-empty strings" });
					return;
				}
				await configTable.put("summarizer", candidate);
				broadcast({ kind: "config", summarizer: effectiveSummarizer() }, "*");
				jsonReply(res, 200, { ok: true, summarizer: effectiveSummarizer() });
				return;
			}
			if (method === "POST" && path === "config-patch") {
				// Partial update from the settings pane: only the fields present in
				// the body change, everything else keeps the values the user already
				// had (configTable overrides on top of the manifest defaults).
				const body = await readBody(req);
				const next = { ...effectiveSettings() };
				if (typeof body.enableRail === "boolean") next.enableRail = body.enableRail;
				if (typeof body.enableSidebar === "boolean") next.enableSidebar = body.enableSidebar;
				if (body.maxTopics !== undefined) next.maxTopics = Number(body.maxTopics);
				if (body.initBackfillCount !== undefined) next.initBackfillCount = Number(body.initBackfillCount);
				if (body.assistantExcerptChars !== undefined) next.assistantExcerptChars = Number(body.assistantExcerptChars);
				if (body.searchResultLimit !== undefined) next.searchResultLimit = Number(body.searchResultLimit);
				if (body.semanticCandidateLimit !== undefined) next.semanticCandidateLimit = Number(body.semanticCandidateLimit);
				if (typeof body.language === "string") next.language = body.language;
				if (body.summarizer !== undefined) {
					const candidate = {
						provider: typeof body.summarizer?.provider === "string" ? body.summarizer.provider.trim() : "",
						model: typeof body.summarizer?.model === "string" ? body.summarizer.model.trim() : "",
					};
					if (!SummarizerConfigSchema.safeParse(candidate).success) {
						jsonReply(res, 400, { error: "provider and model must be non-empty strings" });
						return;
					}
					next.summarizer = candidate;
				}
				const normalized = normalizeConfig(next);
				await configTable.put("settings", {
					enableRail: normalized.enableRail,
					enableSidebar: normalized.enableSidebar,
					maxTopics: normalized.maxTopics,
					initBackfillCount: normalized.initBackfillCount,
					assistantExcerptChars: normalized.assistantExcerptChars,
					searchResultLimit: normalized.searchResultLimit,
					semanticCandidateLimit: normalized.semanticCandidateLimit,
					language: normalized.language,
				});
				await configTable.put("summarizer", normalized.summarizer);
				broadcast({ kind: "config", settings: effectiveSettings() }, "*");
				jsonReply(res, 200, effectiveSettings());
				return;
			}
			if (method === "POST" && path === "restamp") {
				// One-shot repair for topic lists created before timestamps
				// existed: walk the whole log and fill startedAt where missing,
				// without spending a summarizer call or moving any other field.
				const body = await readBody(req);
				const sessionId = String(body.sessionId ?? "");
				if (sessionId.length === 0) {
					jsonReply(res, 400, { error: "sessionId required" });
					return;
				}
				const current = cachedList(sessionId);
				if (current === undefined) {
					jsonReply(res, 200, { ok: true, filled: 0, total: 0 });
					return;
				}
				const { allTimes } = await collectExcerpt(sessionId, -1);
				const repaired = stampTopics(current.topics, current.topics, Date.now(), allTimes);
				const filled = repaired.filter((topic, index) => topic.startedAt !== undefined && current.topics[index]?.startedAt === undefined).length;
				if (filled > 0) {
					const next = { ...current, topics: repaired };
					await table.put(sessionId, next);
					broadcast({ kind: "topics", sessionId, topicList: next }, sessionId);
				}
				jsonReply(res, 200, { ok: true, filled, total: repaired.length });
				return;
			}
			if (method === "GET" && path === "backfill") {
				jsonReply(res, 200, { backfill: { ...backfill } });
				return;
			}
			if (method === "POST" && path === "backfill-control") {
				const body = await readBody(req);
				if (body.action === "pause") backfill.paused = true;
				else if (body.action === "resume") {
					backfill.paused = false;
					void pump();
				} else {
					jsonReply(res, 400, { error: "action must be pause or resume" });
					return;
				}
				broadcastBackfill();
				jsonReply(res, 200, { ok: true, backfill: { ...backfill } });
				return;
			}
			jsonReply(res, 404, { error: "not found" });
		} catch (error) {
			jsonReply(res, 500, { error: String(error?.message ?? error) });
		}
	}

	ctx.effect(
		() => {
			const dispose = ctx.webServer.register({
				kind: "prefix",
				path: ROUTE,
				handler: handle,
			});
			return dispose;
		},
		"session-topics: http route",
	);

	// ---------- init ----------

	const ready = (async () => {
		const domain = await ctx.storageDomain.open(topicsDomainSpec);
		ctx.effect(
			() => () => {
				try {
					domain.close();
				} catch {
					/* closing during teardown */
				}
			},
			"session-topics: domain close",
		);
		table = domain.table("topics");
		configTable = domain.table("config");
		await startBackfill();
	})();
	ready.catch((error) => {
	});
}
