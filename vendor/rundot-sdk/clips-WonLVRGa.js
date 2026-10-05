import { $ as RundotGameRoom, A as validateShareIntentParams, At as MockEnvironmentApi, Bt as toPromptWireRequest, D as validateClickMetadata, Dt as applySafeAreaUpdate, E as stripComposeControlChars, Ft as MockAnalyticsApi, G as MockTimeApi, H as MockPreloaderApi, It as MockAssetLibraryApi, K as isPacificDaylightTime, M as validateShareParams, Mt as MockCdnApi, N as validateShareTarget, Nt as BaseCdnApi, O as validateComposePost, Pt as MockAvatarApi, R as SHARE_FILE_ALLOWED_MIME_TYPES, Rt as defaultPackBaseUrl, T as buildXComposerUrl, Tt as MockFeaturesApi, U as MockCollectiblesApi, Ut as mockLog, V as checkText, Vt as MockAdsApi, W as MockStatsApi, X as ValidatingStorageApi, Y as createMockStorageApi, Z as initializeRoomsApi, _ as MockAccessGateApi, _t as MockHapticsApi, a as MockAttributionApi, at as MockLoggingApi, b as applyAccessGates, ct as MockIapApi, d as MockActivityApi, dt as MockGamepadApi, et as generateId, f as isActivityActionEvent, ft as LatencyTracker, g as WsMultiplayerApi, gt as GAMEPAD_BUTTON_NAMES, h as MockMultiplayerApi, i as MockPlayableApi, it as MockNavigationApi, j as validateShareMetadata, jt as MockDeviceApi, k as validateShareFile, kt as MockSystemApi, m as MockVideoApi, mt as canReadWebGamepads, nt as MockPopupsApi, ot as MockLifecycleApi, pt as WebGamepadReader, rt as MockNotificationsApi, s as MockAppApi, st as MockCreditsApi, t as ClipsApiImpl, tt as PlaygroundProfileApi, u as createRpcAdminGenApi, ut as assertTierSupportsInterval, vt as ExposureDeduper, w as buildRedditComposerUrl, wt as resolveLiveOpsSection, yt as LiveOpsCache, z as SHARE_FILE_MAX_SIZE_BYTES, zt as serializeCanvasInState } from "./ClipsApiImpl-mFIIqDe9.js";
import { a as mapSubmitScoreFailure, c as warnDeprecated, f as asCreditsExhaustedError, g as RundotApiError, h as RateLimitedError, i as computeScoreHash, l as warnRenamed, m as mapCreditsExhaustion, o as utf8ByteLength, s as assertValidImageGenSeed, t as assertReplayWithinInlineCap } from "./replaySize-CX50idnG.js";
import { o as SDK_VERSION, r as getPlaygroundConfig } from "./playground-DX6FPhtu.js";
//#region src/ads/RpcAdsApi.ts
var RpcAdsApi = class {
	rpcClient;
	constructor(rpcClient) {
		this.rpcClient = rpcClient;
	}
	async showInterstitialAd(options) {
		return (await this.rpcClient.call("H5_SHOW_INTERSTITIAL_AD", options || {}, -1)).shown;
	}
	async isInterstitialAdReadyAsync() {
		return (await this.rpcClient.call("H5_IS_INTERSTITIAL_AD_READY")).ready;
	}
	async isRewardedAdReadyAsync() {
		return (await this.rpcClient.call("H5_IS_REWARDED_AD_READY")).ready;
	}
	async showRewardedAdAsync(options) {
		return (await this.rpcClient.call("H5_SHOW_REWARDED_AD", options || {}, -1)).rewardEarned;
	}
};
//#endregion
//#region src/ads/index.ts
function initializeAds(rundotGameApiInstance, host) {
	rundotGameApiInstance.isRewardedAdReadyAsync = host.ads.isRewardedAdReadyAsync.bind(host.ads);
	rundotGameApiInstance.showRewardedAdAsync = host.ads.showRewardedAdAsync.bind(host.ads);
	rundotGameApiInstance.ads = host.ads;
}
//#endregion
//#region src/ai/RpcAiApi.ts
var RpcAiApi = class {
	rpcClient;
	constructor(rpcClient) {
		this.rpcClient = rpcClient;
	}
	async decide(request) {
		const state = serializeCanvasInState(request.state);
		return mapCreditsExhaustion(this.rpcClient.call("H5_AI_DECIDE", { request: {
			...request,
			state
		} }, -1));
	}
	async requestChatCompletionAsync(request) {
		const { apiKey: _apiKey, ...requestWithoutApiKey } = request;
		return mapCreditsExhaustion(this.rpcClient.call("H5_AI_CHAT_COMPLETION", { request: requestWithoutApiKey }, -1));
	}
	async requestPromptCompletionAsync(request) {
		return mapCreditsExhaustion(this.rpcClient.call("H5_AI_CHAT_COMPLETION", { request: toPromptWireRequest(request) }, -1));
	}
	async getAvailableCompletionModels() {
		return await this.rpcClient.call("H5_AI_GET_AVAILABLE_MODELS", {}, -1);
	}
	requestChatCompletionStreamAsync(request, options) {
		const { apiKey: _apiKey, ...requestWithoutApiKey } = request;
		return this.openStream(requestWithoutApiKey, options);
	}
	requestPromptCompletionStreamAsync(request, options) {
		return this.openStream(toPromptWireRequest(request), options);
	}
	/**
	* Shared stream machinery for both open-mode and templated streams: START
	* round-trip, CHUNK/DONE/ERROR notification fan-in, ABORT on cancel, and
	* credits-exhaustion re-typing. The wire request is the only thing that
	* differs between the two public methods.
	*/
	openStream(wireRequest, options) {
		const rpc = this.rpcClient;
		return { [Symbol.asyncIterator]: () => {
			const queue = [];
			const waiters = [];
			let streamId;
			let ended = false;
			let started = false;
			let startPromise = null;
			let abortPending = false;
			const subscriptions = [];
			let onAbort = null;
			const sendAbortIfReady = () => {
				if (streamId) rpc.notify("H5_AI_CHAT_COMPLETION_STREAM_ABORT", { streamId });
				else abortPending = true;
			};
			const push = (item) => {
				if (ended && item.kind !== "end") return;
				if (item.kind !== "chunk") ended = true;
				const waiter = waiters.shift();
				if (waiter) waiter(item);
				else queue.push(item);
			};
			const pull = () => {
				const ready = queue.shift();
				if (ready) return Promise.resolve(ready);
				return new Promise((resolve) => waiters.push(resolve));
			};
			const cleanup = () => {
				for (const sub of subscriptions) sub.unsubscribe();
				subscriptions.length = 0;
				if (onAbort && options?.signal) options.signal.removeEventListener("abort", onAbort);
				onAbort = null;
			};
			const pendingPreStart = [];
			const handleDoneNotification = (payload) => {
				push({
					kind: "chunk",
					value: payload.chunk
				});
				push({ kind: "end" });
				cleanup();
			};
			const handleErrorNotification = (payload) => {
				const message = payload.message ?? payload.error ?? "AI chat completion stream failed";
				const candidateStatus = payload.statusCode ?? payload.status;
				const status = typeof candidateStatus === "number" && Number.isInteger(candidateStatus) && candidateStatus >= 400 && candidateStatus <= 599 ? candidateStatus : 0;
				const code = payload.code ?? payload.error ?? "STREAM_FAILED";
				const error = asCreditsExhaustedError(Object.assign(new Error(message), {
					code: payload.code,
					detail: payload.detail
				})) ?? new RundotApiError(code, message, status);
				push({
					kind: "error",
					error
				});
				cleanup();
			};
			const ensureStarted = async () => {
				if (started) return startPromise;
				started = true;
				startPromise = (async () => {
					const chunkSub = rpc.onNotification("H5_AI_CHAT_COMPLETION_STREAM_CHUNK", (payload) => {
						if (streamId === void 0) {
							pendingPreStart.push({
								kind: "chunk",
								payload
							});
							return;
						}
						if (payload.streamId !== streamId) return;
						push({
							kind: "chunk",
							value: payload.chunk
						});
					});
					const doneSub = rpc.onNotification("H5_AI_CHAT_COMPLETION_STREAM_DONE", (payload) => {
						if (streamId === void 0) {
							pendingPreStart.push({
								kind: "done",
								payload
							});
							return;
						}
						if (payload.streamId !== streamId) return;
						handleDoneNotification(payload);
					});
					const errSub = rpc.onNotification("H5_AI_CHAT_COMPLETION_STREAM_ERROR", (payload) => {
						if (streamId === void 0) {
							pendingPreStart.push({
								kind: "error",
								payload
							});
							return;
						}
						if (payload.streamId !== streamId) return;
						handleErrorNotification(payload);
					});
					subscriptions.push(chunkSub, doneSub, errSub);
					if (options?.signal) {
						if (options.signal.aborted) {
							push({
								kind: "error",
								error: /* @__PURE__ */ new Error("aborted")
							});
							cleanup();
							return;
						}
						onAbort = () => {
							sendAbortIfReady();
							push({
								kind: "error",
								error: /* @__PURE__ */ new Error("aborted")
							});
							cleanup();
						};
						options.signal.addEventListener("abort", onAbort);
					}
					try {
						streamId = (await rpc.call("H5_AI_CHAT_COMPLETION_STREAM_START", { request: wireRequest }, -1)).streamId;
						if (abortPending) {
							rpc.notify("H5_AI_CHAT_COMPLETION_STREAM_ABORT", { streamId });
							pendingPreStart.length = 0;
							return;
						}
						for (const buffered of pendingPreStart) {
							if (buffered.payload.streamId !== streamId) continue;
							if (buffered.kind === "chunk") push({
								kind: "chunk",
								value: buffered.payload.chunk
							});
							else if (buffered.kind === "done") {
								handleDoneNotification(buffered.payload);
								break;
							} else {
								handleErrorNotification(buffered.payload);
								break;
							}
						}
						pendingPreStart.length = 0;
					} catch (err) {
						push({
							kind: "error",
							error: err instanceof Error ? err : new Error(String(err))
						});
						cleanup();
					}
				})();
				return startPromise;
			};
			return {
				next: async () => {
					await ensureStarted();
					const item = await pull();
					if (item.kind === "chunk") return {
						value: item.value,
						done: false
					};
					if (item.kind === "error") throw item.error;
					return {
						value: void 0,
						done: true
					};
				},
				return: async () => {
					if (!ended) {
						sendAbortIfReady();
						push({ kind: "end" });
					}
					ended = true;
					cleanup();
					return {
						value: void 0,
						done: true
					};
				}
			};
		} };
	}
};
//#endregion
//#region src/ai/MockAiApi.ts
var MockAiApi = class MockAiApi {
	async decide(request) {
		const answers = {};
		for (const [qId, q] of Object.entries(request.questions)) if (q.type === "choice") {
			const firstKey = Object.keys(q.criteria)[0];
			if (!firstKey) throw new Error(`Mock decide: choice question "${qId}" has no criteria`);
			answers[qId] = {
				choice: firstKey,
				confidence: 1
			};
		} else if (q.type === "noul") answers[qId] = { noul: 1 };
		else if (q.type === "score") answers[qId] = {
			score: 1,
			confidence: 1
		};
		return {
			answers,
			usage: {
				inputTokens: 100,
				creditsDebited: 1,
				isMultimodal: false
			}
		};
	}
	async requestChatCompletionAsync(request) {
		if (request.tools !== void 0 && request.tools.length > 0) return this.buildMockToolCallResponse(request);
		console.warn("[RUN] AI completion API not available in mock mode");
		throw new Error("AI completion API requires backend connection");
	}
	async getAvailableCompletionModels() {
		console.warn("[RUN] AI models API not available in mock mode");
		throw new Error("AI models API requires backend connection");
	}
	/**
	* Canned stream so agent loops and tool flows can be exercised offline.
	*
	* Unlike the non-streaming sibling this does NOT throw: a streaming consumer
	* that cannot get a first chunk cannot be developed against the mock at all.
	* The text is prefixed `[mock]` so it is never mistaken for a real response.
	*/
	requestChatCompletionStreamAsync(request, options) {
		return this.mockCompletionStream(request, options);
	}
	async requestPromptCompletionAsync(_request) {
		console.warn("[RUN] AI prompt completion API not available in mock mode");
		throw new Error("AI prompt completion API requires backend connection");
	}
	requestPromptCompletionStreamAsync(_request, _options) {
		return this.mockUnavailableStream("AI prompt completion");
	}
	/** Warn-now, throw-on-first-`next()` iterable shared by both mock stream methods. */
	mockUnavailableStream(apiName) {
		console.warn(`[RUN] ${apiName} API not available in mock mode`);
		return { [Symbol.asyncIterator]: () => ({ next: async () => {
			throw new Error(`${apiName} API requires backend connection`);
		} }) };
	}
	/**
	* One tool call on the first pass, then text once a tool result comes back,
	* so a tool loop terminates instead of calling the same tool forever.
	*/
	async *mockCompletionStream(request, options) {
		const usage = {
			prompt_tokens: 0,
			completion_tokens: 0,
			total_tokens: 0
		};
		const tool = request.tools?.[0];
		if (tool && !MockAiApi.hasToolResult(request)) {
			yield {
				type: "tool_call_chunk",
				index: 0,
				id: `mock-tool-${tool.name}-1`,
				name: tool.name
			};
			if (options?.signal?.aborted) return;
			yield {
				type: "tool_call_chunk",
				index: 0,
				argumentsDelta: "{}"
			};
			yield {
				type: "done",
				finishReason: "tool_calls",
				usage
			};
			return;
		}
		for (const text of [
			"[mock] ",
			"This is a canned response; ",
			"connect a backend for a real one."
		]) {
			if (options?.signal?.aborted) return;
			yield {
				type: "delta",
				text
			};
		}
		yield {
			type: "done",
			finishReason: "stop",
			usage
		};
	}
	/** True once the conversation carries a tool result, i.e. a tool already ran. */
	static hasToolResult(request) {
		return request.messages.some((message) => Array.isArray(message.content) && message.content.some((block) => block.type === "tool_result"));
	}
	/**
	* Deterministic canned response when the request supplies tools. Always
	* invokes the first tool in the list with an empty argument object — keeps
	* SDK consumers' tool-flow unit tests stable without a real provider.
	*/
	buildMockToolCallResponse(request) {
		const tool = request.tools[0];
		const toolCalls = [{
			id: `mock-tool-${tool.name}-1`,
			name: tool.name,
			input: {}
		}];
		return {
			id: "mock-completion-1",
			object: "chat.completion",
			created: 0,
			model: request.model ?? "mock",
			choices: [{
				index: 0,
				message: {
					role: "assistant",
					content: "",
					toolCalls
				},
				finish_reason: "tool_calls"
			}],
			usage: {
				prompt_tokens: 0,
				completion_tokens: 0,
				total_tokens: 0
			}
		};
	}
};
//#endregion
//#region src/ai/index.ts
/**
* @deprecated RundotGameAPI.ai is deprecated. Use RundotGameAPI.textGen instead.
*
* Wraps the underlying textGen implementation with a warn-once deprecation
* notice so existing games keep working while migrating.
*/
function initializeAi(rundotGameApi, _host) {
	let warned = false;
	const warn = () => {
		if (!warned) {
			console.warn("[RUN] RundotGameAPI.ai is deprecated. Use RundotGameAPI.textGen instead.");
			warned = true;
		}
	};
	rundotGameApi.ai = {
		async decide(request) {
			return rundotGameApi.textGen.decide(request);
		},
		async requestChatCompletionAsync(request) {
			warn();
			return rundotGameApi.textGen.requestChatCompletionAsync(request);
		},
		async getAvailableCompletionModels() {
			warn();
			return rundotGameApi.textGen.getAvailableCompletionModels();
		},
		requestChatCompletionStreamAsync(request, options) {
			warn();
			return rundotGameApi.textGen.requestChatCompletionStreamAsync(request, options);
		},
		async requestPromptCompletionAsync(request) {
			warn();
			return rundotGameApi.textGen.requestPromptCompletionAsync(request);
		},
		requestPromptCompletionStreamAsync(request, options) {
			warn();
			return rundotGameApi.textGen.requestPromptCompletionStreamAsync(request, options);
		}
	};
}
//#endregion
//#region src/rpc/isUnsupportedMessageError.ts
/**
* True when an RPC rejection is the host's "no handler registered for this
* message id" reply — the signal that the host predates a given (additive)
* protocol and the caller should take its legacy path. The host replies with
* `Unsupported message type: <id>` whenever a requestId-bearing message has
* no registered handler (client H5MessageBus) or `HANDLER_NOT_IMPLEMENTED`
* (playable harness host-core / alternative containers).
*
* Detection matches HostCdnApi.isUnsupportedMessageError: the rejection may
* surface as an Error (RundotApiError) or as a raw `{ error }` payload.
*/
function isUnsupportedMessageError(error) {
	if (error instanceof Error) return error.message.includes("Unsupported message type") || error.message.includes("HANDLER_NOT_IMPLEMENTED");
	if (typeof error === "object" && error !== null && "error" in error) {
		const errStr = String(error.error);
		return errStr.includes("Unsupported message type") || errStr.includes("HANDLER_NOT_IMPLEMENTED");
	}
	return false;
}
//#endregion
//#region src/shared-assets/base64Utils.ts
/**
* Base64 encoding/decoding utilities for embedded assets and libraries.
* 
* These utilities handle base64 data received from the RUN.world host via RPC,
* converting it to ArrayBuffer or UTF-8 strings with appropriate fallbacks
* for different JavaScript environments.
*/
/**
* Convert base64 string to ArrayBuffer.
* Uses native atob() when available for best performance.
*/
function base64ToArrayBuffer(base64) {
	const binaryString = atob(base64);
	const len = binaryString.length;
	const bytes = new Uint8Array(len);
	for (let i = 0; i < len; i++) bytes[i] = binaryString.charCodeAt(i);
	return bytes.buffer;
}
/**
* Decode a base64 chunk directly into `target` starting at `offset`.
*
* Returns the number of bytes actually decoded. Callers assembling a stream
* of chunks MUST advance their cursor by this return value, not by the
* length they requested: native file reads (Android `skip`/`read`) may
* legally return short, and the host encodes only the bytes it read.
*/
function base64DecodeInto(base64, target, offset) {
	const binaryString = atob(base64);
	const len = binaryString.length;
	if (offset < 0 || offset + len > target.length) throw new Error(`base64DecodeInto out of bounds: offset ${offset} + ${len} decoded bytes exceeds target of ${target.length} bytes`);
	for (let i = 0; i < len; i++) target[offset + i] = binaryString.charCodeAt(i);
	return len;
}
/**
* Convert base64 string to UTF-8 string.
* Tries multiple decoding strategies for maximum compatibility.
*/
function base64ToUtf8(base64) {
	if (typeof TextDecoder !== "undefined") {
		const decoder = new TextDecoder("utf-8");
		const buffer = base64ToArrayBuffer(base64);
		return decoder.decode(new Uint8Array(buffer));
	}
	if (typeof globalThis !== "undefined" && typeof globalThis.Buffer !== "undefined") return globalThis.Buffer.from(base64, "base64").toString("utf-8");
	const binaryString = atob(base64);
	let result = "";
	for (let i = 0; i < binaryString.length; i++) result += String.fromCharCode(binaryString.charCodeAt(i));
	return decodeURIComponent(escape(result));
}
//#endregion
//#region src/shared-assets/chunkedAssetReader.ts
/**
* Assemble an asset by pulling it chunk-by-chunk from `source`.
*
* Invariants (all structural, see venus issue #2749):
* - The cursor advances by the ACTUAL decoded byte count of each chunk, so
*   short reads self-heal: the next request re-starts at the real cursor.
* - `length` is always clamped to `totalBytes - position` and a request is
*   never issued at `position >= totalBytes` (Android's native read at EOF
*   returns -1 and its base64 encoder throws on a negative count).
* - A zero-byte chunk cannot advance the cursor and would loop forever, so
*   it is an error.
* - Each chunk gets exactly ONE retry; a second failure aborts the whole
*   transfer. Callers decide what a failed transfer falls back to.
*/
async function readAssetInChunks(source) {
	const { totalBytes, chunkBytes } = source;
	if (!Number.isSafeInteger(totalBytes) || totalBytes < 0) throw new Error(`Invalid chunked asset size: ${totalBytes}`);
	if (!Number.isSafeInteger(chunkBytes) || chunkBytes < 1) throw new Error(`Invalid chunk size: ${chunkBytes}`);
	const assembled = new Uint8Array(totalBytes);
	let received = 0;
	while (received < totalBytes) {
		const length = Math.min(chunkBytes, totalBytes - received);
		received += await readChunkWithRetry(source, received, length, assembled);
	}
	return assembled.buffer;
}
async function readChunkWithRetry(source, position, length, target) {
	try {
		return await readChunkInto(source, position, length, target);
	} catch {
		return readChunkInto(source, position, length, target);
	}
}
async function readChunkInto(source, position, length, target) {
	const decoded = base64DecodeInto(await source.readChunk(position, length), target, position);
	if (decoded === 0) throw new Error(`Empty chunk at position ${position} of ${target.length}`);
	if (decoded > length) throw new Error(`Chunk at position ${position} returned ${decoded} bytes, more than the ${length} requested`);
	return decoded;
}
//#endregion
//#region src/assetLibrary/RpcAssetLibraryApi.ts
/**
* SDK-side ceiling for chunk requests. The effective chunk size is
* min(this, host's maxChunkBytes): shipped games pin their SDK version while
* the host app keeps updating, so the tunable ceiling lives host-side.
*/
const DEFAULT_CHUNK_BYTES = 2097152;
var RpcAssetLibraryApi = class {
	rpcClient;
	rundotGameApi;
	constructor(rpcClient, rundotGameApi) {
		this.rpcClient = rpcClient;
		this.rundotGameApi = rundotGameApi;
	}
	async getPackBaseUrl(packId, version) {
		try {
			const { baseUrl } = await this.rpcClient.call("H5_ASSET_LIBRARY_GET_PACK_BASE_URL", {
				packId,
				version
			});
			return baseUrl;
		} catch (error) {
			if (isUnsupportedMessageError(error)) return defaultPackBaseUrl(packId, version);
			throw error;
		}
	}
	async loadAssetsBundle(game, bundleKey, fileType = "stow") {
		try {
			return await this.loadViaHostRpc(bundleKey);
		} catch (err) {
			try {
				return await (await this.rundotGameApi.cdn.fetchFromCdn(`${game}/${bundleKey}.${fileType}`)).arrayBuffer();
			} catch (e) {
				throw new Error(`Failed to load ${bundleKey}`);
			}
		}
	}
	/**
	* Pull the asset from the host in chunks. Only a host that predates the
	* chunk protocol (BEGIN rejected with "Unsupported message type") falls
	* back to the legacy single-shot RPC. A failure DURING the chunked
	* transfer must NOT fall back to single-shot: pushing the whole asset
	* through the bridge in one message is the exact Android wedge this
	* protocol exists to avoid (venus issue #2749). Those errors propagate to
	* the caller's CDN fallback instead.
	*/
	async loadViaHostRpc(bundleKey) {
		let begin;
		try {
			begin = await this.rpcClient.callT("H5_LOAD_EMBEDDED_ASSET_BEGIN", { assetKey: bundleKey });
		} catch (error) {
			if (isUnsupportedMessageError(error)) return this.loadSingleShot(bundleKey);
			throw error;
		}
		if (!Number.isSafeInteger(begin.maxChunkBytes) || begin.maxChunkBytes < 1) throw new Error(`Host returned invalid maxChunkBytes: ${begin.maxChunkBytes}`);
		return readAssetInChunks({
			totalBytes: begin.totalBytes,
			chunkBytes: Math.min(DEFAULT_CHUNK_BYTES, begin.maxChunkBytes),
			readChunk: async (position, length) => {
				return (await this.rpcClient.callT("H5_LOAD_EMBEDDED_ASSET_CHUNK", {
					assetKey: bundleKey,
					position,
					length
				})).base64Data;
			}
		});
	}
	async loadSingleShot(bundleKey) {
		return base64ToArrayBuffer((await this.rpcClient.callT("H5_LOAD_EMBEDDED_ASSET", { assetKey: bundleKey })).base64Data);
	}
};
//#endregion
//#region src/assetLibrary/index.ts
function initializeAssetLibrary(rundotGameApiInstance, host) {
	rundotGameApiInstance.assetLibrary = host.assetLibrary;
	rundotGameApiInstance.sharedAssets = host.assetLibrary;
}
//#endregion
//#region src/textGen/index.ts
function initializeTextGen(rundotGameApi, host) {
	rundotGameApi.textGen = host.textGen;
}
//#endregion
//#region src/analytics/RpcAnalyticsApi.ts
var RpcAnalyticsApi = class {
	rpcClient;
	constructor(rpcClient) {
		this.rpcClient = rpcClient;
	}
	async recordCustomEvent(eventName, payload) {
		this.rpcClient.notify("H5_LOG_ANALYTICS_EVENT", {
			eventName,
			params: payload
		});
	}
	async trackFunnelStep(stepNumber, stepName, funnelName, funnelOrder) {
		this.rpcClient.notify("H5_TRACK_FUNNEL_STEP", {
			stepNumber,
			stepName,
			funnelName,
			funnelOrder
		});
	}
};
//#endregion
//#region src/analytics/index.ts
function initializeAnalytics(rundotGameApiInstance, host) {
	rundotGameApiInstance.logCustomEvent = async (options) => {
		await host.analytics.recordCustomEvent(options.eventName, options.params);
	};
	rundotGameApiInstance.analytics = host.analytics;
}
//#endregion
//#region src/avatar3d/RpcAvatarApi.ts
/**
* @deprecated The 3D Avatar system is deprecated and will be removed in a future release.
*/
var RpcAvatarApi = class RpcAvatarApi {
	static didWarn = false;
	warnDeprecated() {
		if (!RpcAvatarApi.didWarn) {
			RpcAvatarApi.didWarn = true;
			console.warn("[SDK] Avatar3D API is deprecated and will be removed in a future release.");
		}
	}
	rundotGameApi;
	rpcClient;
	constructor(rpcClient, rundotGameApi) {
		this.rpcClient = rpcClient;
		this.rundotGameApi = rundotGameApi;
	}
	async downloadAssetPaths() {
		this.warnDeprecated();
		const rundotGameApi = this.rundotGameApi;
		const manifestUrl = rundotGameApi.cdn.resolveAvatarAssetUrl("assets.json");
		const categories = (await this.fetchFromCdn(manifestUrl)).categories || {};
		const assetPaths = {};
		for (const categoryKey in categories) {
			const categoryData = categories[categoryKey];
			const categoryPath = categoryKey;
			assetPaths[categoryKey] = (categoryData?.assets || []).map((asset) => {
				return rundotGameApi.cdn.resolveAvatarAssetUrl(categoryPath + "/" + asset.filename);
			});
		}
		return assetPaths;
	}
	async downloadManifest() {
		this.warnDeprecated();
		const manifestUrl = this.rundotGameApi.cdn.resolveAvatarAssetUrl("assets.json");
		return await this.fetchFromCdn(manifestUrl);
	}
	async loadAvatar(avatarId) {
		this.warnDeprecated();
		return await this.rpcClient.call("H5_AVATAR3D_LOAD", { avatar3dId: avatarId });
	}
	saveAvatar(config) {
		this.warnDeprecated();
		return this.rpcClient.call("H5_AVATAR3D_SAVE", { config });
	}
	deleteAvatar() {
		this.warnDeprecated();
		return this.rpcClient.call("H5_AVATAR3D_DELETE");
	}
	async showEditor(options) {
		this.warnDeprecated();
		const rawResult = await this.rpcClient.call("H5_STACK_PUSH_REQUEST", {
			targetAppId: "AVATAR3D",
			contextData: options?.contextData || {},
			appParams: {
				currentAvatar: options?.currentAvatar,
				onSave: options?.onSave,
				onCancel: options?.onCancel
			}
		});
		return {
			wasChanged: rawResult.wasChanged || false,
			config: rawResult.config || null,
			savedAvatarId: rawResult.savedAvatarId || null
		};
	}
	async fetchFromCdn(url) {
		const response = await fetch(url, {
			method: "GET",
			headers: {
				Accept: "application/json, text/plain, */*",
				"Content-Type": "application/json"
			},
			mode: "cors",
			cache: "no-cache"
		});
		if (!response.ok) throw new Error(`CDN fetch failed: ${response.status} ${response.statusText}`);
		return await response.json();
	}
};
//#endregion
//#region src/avatar3d/index.ts
function initializeAvatar3d(rundotGameApi, host) {
	rundotGameApi.loadAvatar3dAsync = host.avatar3d.loadAvatar.bind(host.avatar3d);
	rundotGameApi.saveAvatar3dAsync = host.avatar3d.saveAvatar.bind(host.avatar3d);
	rundotGameApi.deleteAvatar3dAsync = host.avatar3d.deleteAvatar.bind(host.avatar3d);
	rundotGameApi.downloadAvatar3dManifestAsync = host.avatar3d.downloadManifest.bind(host.avatar3d);
	rundotGameApi.showAvatar3dEditorAsync = host.avatar3d.showEditor.bind(host.avatar3d);
	rundotGameApi.downloadAvatar3dAssetPathsAsync = host.avatar3d.downloadAssetPaths.bind(host.avatar3d);
}
//#endregion
//#region src/cdn/cdn-url-utils.ts
/**
* Shared URL parsing utilities for CDN path detection.
*
* Scope: locating a deployed game's assets (which bucket, which gameId, which
* version) from its own URL — that and nothing else. Whether a RUN host is
* present is a separate question with a separate answer
* (`rundot-game-api/hosted-environment.ts`); it is NOT derivable from the URL.
*
* Two URL shapes are supported (H5 lockdown R4):
*
*   1. Legacy single-host
*      https://h5-apps.<env>.getreel.com/<env>/<gameId>/<version>/index.html
*      → bucketBaseUrl = origin + "/<env>"
*      → gameId        = "<gameId>"
*      → version       = "<version>"
*
*   2. Per-app subdomain
*      https://<gameId>.h5-apps.<env>.getreel.com/<version>/index.html
*      https://<gameId>.h5-apps.getreel.com/<version>/index.html   (prod bare apex)
*      → bucketBaseUrl = origin
*      → gameId        = host.split('.')[0]
*      → version       = "<version>"
*
* The {@link ParsedCdnLocation.shape} discriminator records which shape
* matched so callers can branch on it explicitly rather than re-deriving
* the shape from `bucketBaseUrl` later.
*/
/** Minimum number of non-empty path segments (after stripping filename) required for the legacy hosted CDN URL. */
const MIN_CDN_PATH_SEGMENTS = 3;
/** Pattern matching common web page file extensions (used to strip trailing filenames). */
const FILE_EXTENSION_PATTERN = /\.(html?|php|jsp|aspx?)$/i;
/** Per-app subdomain host pattern: `<gameId>.h5-apps.<env>.getreel.com` or `<gameId>.h5-apps.getreel.com` (prod bare apex). */
const PER_APP_SUBDOMAIN_HOST_PATTERN = /^[a-z0-9-]+\.h5-apps\.(?:[a-z0-9-]+\.)?getreel\.com$/;
/**
* Per-app LOCAL host pattern: `<gameId>.h5-apps.localhost[:port]`.
*
* WHY this exists: in local docker dev the venus client serves game bytes
* through the local h5-origin-shim on `http://<gameId>.h5-apps.localhost:10081`
* (an http origin is required so games may open the local `ws://` room server —
* the https CDN origin is mixed-content-blocked). Asset resolution must
* recognize that form, or a game running against the LOCAL client can't locate
* its own assets — which is exactly a production-shaped bug local dev exists to
* catch. (Whether a host is present is decided separately, from the client's
* mount params; this pattern says nothing about that.)
*
* WHY it is safe to trust: `.localhost` is IETF-reserved (RFC 6761
* §6.3) — browsers resolve it to loopback and it cannot be registered as a
* public domain, so no attacker-controlled page can wear this suffix. The
* anti-spoof property of the anchored getreel pattern is unchanged. Matched
* against `url.host`, which carries the port for non-default ports, hence the
* optional `:port`.
*/
const PER_APP_LOCAL_HOST_PATTERN = /^[a-z0-9-]+\.h5-apps\.localhost(?::\d+)?$/;
/**
* Return true when {@link host} matches the per-app subdomain layout
* `<gameId>.h5-apps.<env>.getreel.com` (or `<gameId>.h5-apps.getreel.com` for
* the prod bare apex), or the local docker-shim form
* `<gameId>.h5-apps.localhost[:port]`. The patterns are anchored at both ends
* so attacker suffixes like `evil.h5-apps.getreel.com.attacker.tld` do NOT
* match (and `.localhost` is loopback-only per RFC 6761, so it cannot be an
* attacker suffix either).
*
* Returns false for the legacy single-host (`h5-apps.<env>.getreel.com`),
* bare localhost / dev-server hosts, and anything else.
*/
function isPerAppSubdomain(host) {
	return PER_APP_SUBDOMAIN_HOST_PATTERN.test(host) || PER_APP_LOCAL_HOST_PATTERN.test(host);
}
/**
* Parse the {@link url}'s pathname into cleaned non-empty segments.
*
* - Splits `pathname` on `/` and removes empty parts.
* - Strips a trailing filename if it matches {@link FILE_EXTENSION_PATTERN}.
*
* Internal helper to {@link parseCdnLocationFromUrl}.
*/
function cleanPathSegments(url) {
	const pathParts = url.pathname.split("/").filter((part) => part.length > 0);
	const lastPart = pathParts[pathParts.length - 1];
	if (lastPart && FILE_EXTENSION_PATTERN.test(lastPart)) return pathParts.slice(0, -1);
	return pathParts;
}
/**
* Parse the current `window.location` into cleaned path segments suitable
* for legacy-shape CDN URL extraction. Kept for back-compat with external
* consumers (re-exported from the SDK barrel).
*
* Note: for new code, prefer {@link parseCdnLocationFromWindow}, which
* handles both legacy and per-app subdomain shapes.
*/
function parseCdnPathSegments() {
	if (typeof window === "undefined") return null;
	try {
		return cleanPathSegments(new URL(window.location.href));
	} catch {
		return null;
	}
}
/**
* Parse a {@link URL} into a {@link ParsedCdnLocation}, detecting whether
* it is a per-app subdomain or a legacy single-host CDN URL.
*
* Returns `null` if neither shape matches (e.g., localhost dev URLs, or
* a host that matches per-app but has no version segment).
*/
function parseCdnLocationFromUrl(url) {
	if (isPerAppSubdomain(url.host)) {
		const cleanedParts = cleanPathSegments(url);
		if (cleanedParts.length < 1) return null;
		const gameId = url.host.split(".")[0];
		const version = cleanedParts[0];
		return {
			bucketBaseUrl: url.origin,
			gameId,
			version,
			shape: "per-app"
		};
	}
	const cleanedParts = cleanPathSegments(url);
	if (cleanedParts.length < 3) return null;
	const version = cleanedParts[cleanedParts.length - 1];
	const gameId = cleanedParts[cleanedParts.length - 2];
	const bucketPath = cleanedParts.slice(0, -2).join("/");
	return {
		bucketBaseUrl: bucketPath ? `${url.origin}/${bucketPath}` : url.origin,
		gameId,
		version,
		shape: "legacy"
	};
}
/**
* Parse the current `window.location` into a {@link ParsedCdnLocation}.
* Returns `null` outside a browser environment, on URL parse failure, or
* when the location matches neither shape.
*/
function parseCdnLocationFromWindow() {
	if (typeof window === "undefined") return null;
	try {
		return parseCdnLocationFromUrl(new URL(window.location.href));
	} catch {
		return null;
	}
}
//#endregion
//#region src/cdn/HostCdnApi.ts
/**
* CDN API implementation for production/remote environments.
* Automatically derives the CDN URL from the current window location.
* Uses RPC to delegate URL resolution to the Client App, with legacy fallback.
*/
var HostCdnApi = class HostCdnApi extends BaseCdnApi {
	static CDN_FOLDER_NAME = "cdn-assets";
	static MANIFEST_FILE_PREFIX = "manifest_";
	static SHARED_ASSETS_CDN_BASE = "https://venus-static-01293ak.web.app";
	bucketBaseUrl;
	gameId;
	version;
	shape;
	rpcClient;
	manifestCache = null;
	manifestPromise = null;
	constructor(rpcClient) {
		super();
		this.rpcClient = rpcClient;
		const { bucketBaseUrl, gameId, version, shape } = this.computeCdnInfo();
		this.bucketBaseUrl = this.normalizeBaseUrl(bucketBaseUrl);
		this.gameId = gameId;
		this.version = version;
		this.shape = shape;
	}
	getCdnAssetsBaseUrl() {
		if (this.shape === "per-app") return `${this.bucketBaseUrl}/${HostCdnApi.CDN_FOLDER_NAME}`;
		return `${this.bucketBaseUrl}/${this.gameId}/${HostCdnApi.CDN_FOLDER_NAME}`;
	}
	getCdnBaseUrl() {
		return this.bucketBaseUrl;
	}
	getSharedAssetsCdnBaseUrl() {
		return HostCdnApi.SHARED_ASSETS_CDN_BASE;
	}
	/**
	* Compute CDN information from the current window location.
	*
	* Accepts both supported URL shapes — see `parseCdnLocationFromUrl` in
	* cdn-url-utils for the layouts. The shape discriminator is propagated
	* to {@link getCdnAssetsBaseUrl}.
	*
	* @throws {Error} If not in browser environment or URL structure doesn't match either expected shape
	*/
	computeCdnInfo() {
		if (typeof window === "undefined") throw new Error("[RUN] Cannot construct CDN URL: window is undefined (not in browser environment)");
		const location = parseCdnLocationFromWindow();
		if (location === null) throw new Error(`[RUN] Cannot construct CDN URL: location matches neither per-app subdomain (<gameId>.h5-apps.<env>.getreel.com/<version>/...) nor legacy single-host (/{bucket}/{gameId}/{version}/...). Got: ${window.location.href}`);
		return location;
	}
	/**
	* Fetch directly from CDN root (bucket root).
	* This is the primitive fetch operation that accesses files from the bucket base URL.
	*
	* @param subPath - Path relative to bucket root (e.g., "othergame/bundle.stow", "game123/cdn-assets/file.png")
	* @param options - Optional fetch options including timeout
	* @returns Promise<Blob> - The asset data as a Blob
	*
	* @example
	* // App URL: https://h5-apps.dev.com/development/game123/v1.0.0/
	* // fetchFromCdn("othergame/asset.png")
	* // → https://h5-apps.dev.com/development/othergame/asset.png
	*/
	async fetchFromCdn(subPath, options) {
		const url = this.buildCdnUrl(subPath, this.bucketBaseUrl);
		return this.executeFetch(url, options);
	}
	/**
	* Resolve a logical asset path to its actual CDN URL.
	* Uses RPC to delegate resolution to the Client App (which handles entitlements
	* and signed URLs). Falls back to legacy manifest-based resolution if the
	* Client App doesn't have the CDN handler.
	*/
	async resolveAssetUrl(subPath) {
		const normalizedPath = this.cleanSubPath(subPath);
		try {
			return (await this.rpcClient.call("H5_CDN_RESOLVE_ASSET_URL", { assetPath: normalizedPath })).url;
		} catch (error) {
			if (this.isUnsupportedMessageError(error)) return this.legacyResolveAssetUrl(normalizedPath);
			throw error;
		}
	}
	/**
	* Batch resolve multiple asset paths to their CDN URLs.
	* Returns per-path results — a missing entitlement on one path does not fail the batch.
	*/
	async resolveAssetUrls(subPaths) {
		const normalizedPaths = subPaths.map((p) => this.cleanSubPath(p));
		try {
			return (await this.rpcClient.call("H5_CDN_RESOLVE_ASSET_URLS", { assetPaths: normalizedPaths })).results;
		} catch (error) {
			if (this.isUnsupportedMessageError(error)) return this.legacyResolveAssetUrls(subPaths, normalizedPaths);
			throw error;
		}
	}
	/**
	* Refresh the Client App's entitlement cache.
	* Call after a purchase or reward grant so newly acquired entitlements take effect.
	*/
	async refreshEntitlements() {
		try {
			await this.rpcClient.call("H5_CDN_REFRESH_ENTITLEMENTS", {});
		} catch (error) {
			if (this.isUnsupportedMessageError(error)) return;
			throw error;
		}
	}
	/**
	* Legacy fallback — fetches manifest directly and builds public URL.
	* Only works for public assets. Protected assets throw a clear error.
	*/
	async legacyResolveAssetUrl(normalizedPath) {
		const manifest = await this.getManifestLegacy();
		const entry = manifest.files[normalizedPath];
		if (!entry) throw new Error(`[RUN] Asset not found in manifest: ${normalizedPath}. Available paths: ${Object.keys(manifest.files).join(", ")}`);
		const hash = typeof entry === "string" ? entry : entry.hash;
		if (typeof entry === "object" && entry.protected === true) throw new Error(`[RUN] Asset "${normalizedPath}" requires entitlement validation. Update the Client App to a version that supports CDN entitlements.`);
		const extensionMatch = normalizedPath.match(/\.([^.]+)$/);
		const extension = extensionMatch ? extensionMatch[1] : "";
		const actualFilename = extension ? `${hash}.${extension}` : hash;
		return this.buildCdnUrl(actualFilename, this.getCdnAssetsBaseUrl());
	}
	async legacyResolveAssetUrls(originalPaths, normalizedPaths) {
		return Promise.all(normalizedPaths.map(async (p, i) => {
			try {
				const url = await this.legacyResolveAssetUrl(p);
				return {
					path: originalPaths[i],
					status: "ok",
					url
				};
			} catch (error) {
				const isEntitlementError = error instanceof Error && error.message.includes("requires entitlement validation");
				return {
					path: originalPaths[i],
					status: "error",
					error: isEntitlementError ? "ENTITLEMENT_REQUIRED" : "ASSET_NOT_FOUND"
				};
			}
		}));
	}
	isUnsupportedMessageError(error) {
		if (error instanceof Error) return error.message.includes("Unsupported message type");
		if (typeof error === "object" && error !== null && "error" in error) return String(error.error).includes("Unsupported message type");
		return false;
	}
	/**
	* Fetch an asset using the manifest to resolve the actual hashed filename.
	*
	* @param relativePath - The logical path to the asset (e.g., "/assets/sample.json" or "assets/sample.json")
	* @param options - Optional fetch options including timeout
	* @returns Promise<Blob> - The asset data as a Blob
	* @throws {Error} If the asset is not found in the manifest or the fetch fails
	*/
	async fetchAsset(relativePath, options) {
		const resolvedUrl = await this.resolveAssetUrl(relativePath);
		return this.executeFetch(resolvedUrl, options);
	}
	/**
	* Get the manifest (legacy fallback), either from cache or by fetching it.
	* Uses promise caching to prevent multiple simultaneous fetches.
	*/
	async getManifestLegacy() {
		if (this.manifestCache) return this.manifestCache;
		if (this.manifestPromise) return this.manifestPromise;
		this.manifestPromise = this.fetchManifestLegacy();
		try {
			const manifest = await this.manifestPromise;
			this.manifestCache = manifest;
			return manifest;
		} finally {
			this.manifestPromise = null;
		}
	}
	/**
	* Fetch the manifest file from the CDN (legacy fallback).
	* The manifest filename is based on the version: manifest_{version}.json
	*/
	async fetchManifestLegacy() {
		const manifestFilename = `${HostCdnApi.MANIFEST_FILE_PREFIX}${this.version}.json`;
		const manifestUrl = this.buildCdnUrl(manifestFilename, this.getCdnAssetsBaseUrl());
		try {
			const response = await fetch(manifestUrl, {
				method: "GET",
				headers: { Accept: "application/json" },
				mode: "cors",
				cache: "default"
			});
			if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
			const manifest = await response.json();
			if (!manifest.files || typeof manifest.files !== "object") throw new Error("Invalid manifest structure: missing or invalid \"files\" property");
			return manifest;
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			throw new Error(`[RUN] Failed to fetch CDN manifest (${manifestFilename}): ${message}`);
		}
	}
};
//#endregion
//#region src/cdn/index.ts
function initializeCdn(rundotGameApi, host) {
	rundotGameApi.cdn = host.cdn;
}
//#endregion
//#region src/device/HostDeviceApi.ts
var HostDeviceApi = class {
	rundotGameApi;
	constructor(rundotGameApi) {
		this.rundotGameApi = rundotGameApi;
	}
	getDevice() {
		const device = this.rundotGameApi._deviceData;
		if (!device) throw new Error("[RUN] Device info not available. You must await RundotGameAPI.initializeAsync() before calling getDevice(). INIT_SDK has not completed.");
		return device;
	}
};
//#endregion
//#region src/environment/HostEnvironmentApi.ts
var HostEnvironmentApi = class {
	rundotGameApi;
	constructor(rundotGameApi) {
		this.rundotGameApi = rundotGameApi;
	}
	getEnvironment() {
		const environment = this.rundotGameApi._environmentData;
		if (!environment) throw new Error("[RUN] Environment info not available. You must await RundotGameAPI.initializeAsync() before calling getEnvironment(). INIT_SDK has not completed.");
		return {
			...environment,
			capabilities: {
				ads: environment.capabilities?.ads ?? true,
				purchases: environment.capabilities?.purchases ?? true,
				subscriptions: environment.capabilities?.subscriptions ?? environment.capabilities?.purchases ?? true,
				fullscreen: environment.capabilities?.fullscreen ?? "unavailable",
				pointerLock: environment.capabilities?.pointerLock ?? false,
				cta: environment.capabilities?.cta ?? environment.executionMode === "playable",
				persistence: environment.capabilities?.persistence ?? "cloud",
				online: environment.capabilities?.online ?? true
			},
			isSteamDesktop: environment.isSteamDesktop ?? false,
			isSteamDeck: environment.isSteamDeck ?? false,
			executionMode: environment.executionMode ?? "full",
			playableInfo: environment.playableInfo
		};
	}
};
//#endregion
//#region src/system/HostSystemApi.ts
const FULLSCREEN_QUERY_TIMEOUT_MS = 1e3;
const FULLSCREEN_MUTATION_TIMEOUT_MS = 5e3;
const INACTIVE_FULLSCREEN_STATE = {
	active: false,
	pointerLocked: false
};
/**
* Host implementation of SystemApi that delegates to device and environment APIs.
* Acts as a facade combining both system-level information sources.
*/
var HostSystemApi = class {
	deviceApi;
	environmentApi;
	rundotGameApi;
	rpcClient;
	fullscreenKeyTarget;
	fullscreenState = { ...INACTIVE_FULLSCREEN_STATE };
	/**
	* Monotonic per-mutation stamp. Responses can arrive out of order, and an
	* older one must never overwrite the state a newer call already applied.
	*/
	fullscreenSequence = 0;
	appliedSequence = 0;
	fullscreenMutationVersion = 0;
	pendingFullscreenMutations = 0;
	constructor(deviceApi, environmentApi, rundotGameApi, rpcClient, fullscreenKeyTarget = typeof window === "undefined" ? null : window) {
		this.deviceApi = deviceApi;
		this.environmentApi = environmentApi;
		this.rundotGameApi = rundotGameApi;
		this.rpcClient = rpcClient;
		this.fullscreenKeyTarget = fullscreenKeyTarget;
		this.rpcClient.onNotification("H5_SYSTEM_FULLSCREEN_STATE_CHANGED", (state) => this.trackFullscreenState(state));
		this.fullscreenKeyTarget?.addEventListener("keydown", this.handleFullscreenKeyDown);
	}
	getDevice() {
		return this.deviceApi.getDevice();
	}
	getEnvironment() {
		return this.environmentApi.getEnvironment();
	}
	getSafeArea() {
		const safeArea = this.rundotGameApi._safeAreaData;
		if (!safeArea) throw new Error("[RUN] getSafeArea() called before initialization. Call RundotGameAPI.initializeAsync() first.");
		return { ...safeArea };
	}
	isMobile() {
		const environment = this.environmentApi.getEnvironment();
		if (environment.platform === "ios" || environment.platform === "android") return true;
		if (environment.browserInfo) return environment.browserInfo.isMobile;
		return true;
	}
	isWeb() {
		const environment = this.environmentApi.getEnvironment();
		if (environment.platform === "web") return true;
		if (environment.browserInfo && !environment.browserInfo.isMobile) return true;
		return false;
	}
	isSteamDesktop() {
		return this.environmentApi.getEnvironment().isSteamDesktop;
	}
	isSteamDeck() {
		return this.environmentApi.getEnvironment().isSteamDeck;
	}
	async canAddToHomeScreen() {
		const response = await this.rpcClient.call("H5_SYSTEM_CAN_ADD_TO_HOME_SCREEN", {});
		return Boolean(response?.canAdd);
	}
	async addToHomeScreen() {
		const response = await this.rpcClient.call("H5_SYSTEM_ADD_TO_HOME_SCREEN", {}, -1);
		return { added: Boolean(response?.added) };
	}
	async requestFullscreen(options = {}) {
		return this.mutate("H5_SYSTEM_REQUEST_FULLSCREEN", options, () => ({ ...this.fullscreenState }));
	}
	async exitFullscreen() {
		return this.mutate("H5_SYSTEM_EXIT_FULLSCREEN", {}, () => ({ ...this.fullscreenState }));
	}
	async setPointerLock(locked) {
		return this.mutate("H5_SYSTEM_SET_POINTER_LOCK", { locked }, () => ({
			...this.fullscreenState,
			reason: "timeout"
		}));
	}
	async mutate(message, payload, onFailure) {
		const sequence = ++this.fullscreenSequence;
		this.fullscreenMutationVersion += 1;
		this.pendingFullscreenMutations += 1;
		try {
			const state = await this.rpcClient.call(message, payload, FULLSCREEN_MUTATION_TIMEOUT_MS);
			this.trackFullscreenState(state, sequence);
			return state;
		} catch {
			const failureState = onFailure();
			this.trackFullscreenState(failureState, sequence);
			return failureState;
		} finally {
			this.pendingFullscreenMutations -= 1;
		}
	}
	canFullscreen() {
		return this.getEnvironment().capabilities?.fullscreen === "toggleable";
	}
	async getFullscreenState() {
		const sequence = ++this.fullscreenSequence;
		const mutationVersion = this.fullscreenMutationVersion;
		const mutationWasPending = this.pendingFullscreenMutations > 0;
		try {
			const state = await this.rpcClient.call("H5_SYSTEM_GET_FULLSCREEN_STATE", {}, FULLSCREEN_QUERY_TIMEOUT_MS);
			if (!mutationWasPending && mutationVersion === this.fullscreenMutationVersion) this.trackFullscreenState(state, sequence);
			return state;
		} catch {
			return { ...INACTIVE_FULLSCREEN_STATE };
		}
	}
	onFullscreenStateChange(listener) {
		const subscription = this.rpcClient.onNotification("H5_SYSTEM_FULLSCREEN_STATE_CHANGED", listener);
		return () => subscription.unsubscribe();
	}
	onPointerInput(listener) {
		const subscription = this.rpcClient.onNotification("H5_SYSTEM_POINTER_INPUT", listener);
		return () => subscription.unsubscribe();
	}
	trackFullscreenState(state, sequence) {
		if (sequence !== void 0) {
			if (sequence < this.appliedSequence) return;
			this.appliedSequence = sequence;
		}
		this.fullscreenState = {
			active: state.active === true,
			pointerLocked: state.pointerLocked === true
		};
	}
	/**
	* Escape frees the cursor before it quits.
	*
	* While the cursor is captured this does nothing: the engine consumes that
	* Escape to release the lock, and quitting as well would skip the free-cursor
	* fullscreen state a pause menu lives in. Only a fullscreen state with a free
	* cursor exits.
	*
	* This handler is the PRIMARY path, not a duplicate of the host controller's:
	* key events inside a cross-origin game iframe do not bubble to the host
	* document, so while the player is in the game only this one sees the key.
	*
	* Some engines exit lock and fullscreen together and deliver no keydown at
	* all. That is why games must treat the state events as the truth.
	*/
	handleFullscreenKeyDown = (event) => {
		if (event.key !== "Escape" || !this.fullscreenState.active || this.fullscreenState.pointerLocked || this.isSteamDeck()) return;
		this.exitFullscreen();
	};
};
//#endregion
//#region src/system/index.ts
function initializeSystem(rundotGameApi, host) {
	rundotGameApi.system = host.system;
	rundotGameApi.isMobile = () => {
		console.warn("[RUN] DEPRECATED: RundotGameAPI.isMobile() is deprecated. Use RundotGameAPI.system.isMobile() instead.");
		return host.system.isMobile();
	};
	rundotGameApi.isWeb = () => {
		console.warn("[RUN] DEPRECATED: RundotGameAPI.isWeb() is deprecated. Use RundotGameAPI.system.isWeb() instead.");
		return host.system.isWeb();
	};
}
//#endregion
//#region src/features/RpcFeaturesApi.ts
var RpcFeaturesApi = class {
	rpcClient;
	constructor(rcpClient) {
		this.rpcClient = rcpClient;
	}
	async getExperiment(experimentName) {
		return await this.rpcClient.call("H5_GET_EXPERIMENT", { experimentName });
	}
	async getFeatureFlag(flagName) {
		return await this.rpcClient.call("H5_GET_FEATURE_FLAG", { flagName });
	}
	async getFeatureGate(gateName) {
		return await this.rpcClient.call("H5_GET_FEATURE_GATE", { gateName });
	}
};
//#endregion
//#region src/features/index.ts
function initializeFeaturesApi(rundotGameApi, host) {
	rundotGameApi.getExperiment = (options) => {
		return host.features.getExperiment(options.experimentName);
	};
	rundotGameApi.getFeatureGate = (options) => {
		return host.features.getFeatureGate(options.gateName);
	};
	rundotGameApi.getFeatureFlag = (options) => {
		return host.features.getFeatureFlag(options.flagName);
	};
}
//#endregion
//#region src/liveops/RpcLiveOpsApi.ts
var RpcLiveOpsApi = class {
	cache;
	constructor(rpcClient, hooks) {
		this.cache = new LiveOpsCache(() => rpcClient.call("H5_GET_LIVEOPS_CONFIG", {}), hooks);
	}
	clearConfigCache() {
		this.cache.clear();
	}
	getConfigAsync(options) {
		return this.cache.getConfig(options?.maxAgeMs);
	}
	getRawConfigAsync(options) {
		return this.cache.getRaw(options?.maxAgeMs);
	}
};
//#endregion
//#region src/liveops/MockLiveOpsApi.ts
/**
* Mock LiveOps — serves the local `rundot/liveops.config.json` `client` section so
* you can develop against LiveOps without playground sign-in or a backend. The
* section comes from either an explicit `configure()` (tests) or a live provider
* MockHost wires to `rundotGameApi._mock.liveops.client` (the Vite plugin injects
* that from the on-disk file; edits hot-reload). Read live on every call — the
* same pure resolver as prod, anchored to `Date.now()`, so scheduled overrides
* flip on schedule.
*/
var MockLiveOpsApi = class {
	getClient;
	hooks;
	explicitClient;
	configured = false;
	deduper;
	constructor(getClient, hooks) {
		this.getClient = getClient;
		this.hooks = hooks;
		this.deduper = new ExposureDeduper(hooks?.onExposure);
	}
	/** Explicit override (wins over the provider). Used by tests and programmatic setup. */
	configure(config) {
		this.explicitClient = config.client;
		this.configured = true;
	}
	clearConfigCache() {}
	resolveClient() {
		if (this.configured) return this.explicitClient;
		return this.getClient?.();
	}
	async getConfigAsync() {
		const unitId = this.hooks?.getUnitId?.();
		const resolved = resolveLiveOpsSection(this.resolveClient(), Date.now(), unitId);
		if (unitId !== void 0) this.deduper.record(unitId, resolved.assignments, "mock");
		return {
			...resolved,
			configVersion: "mock"
		};
	}
	async getRawConfigAsync() {
		const client = this.resolveClient();
		return {
			values: client?.values ?? {},
			overrides: client?.overrides ?? [],
			experiments: client?.experiments ?? [],
			configVersion: "mock",
			serverTimeMs: Date.now()
		};
	}
};
//#endregion
//#region src/liveops/index.ts
function initializeLiveOps(rundotGameApi, host) {
	rundotGameApi.liveops = {
		getConfigAsync: (options) => host.liveops.getConfigAsync(options),
		getRawConfigAsync: (options) => host.liveops.getRawConfigAsync(options)
	};
}
//#endregion
//#region src/haptics/RpcHapticsApi.ts
var RpcHapticsApi = class {
	rpcClient;
	constructor(rpcClient) {
		this.rpcClient = rpcClient;
	}
	async triggerHapticAsync(style) {
		await this.rpcClient.call("H5_TRIGGER_HAPTIC", { style });
	}
};
//#endregion
//#region src/haptics/index.ts
function initializeHaptics(rundotGameApi, host) {
	rundotGameApi.triggerHapticAsync = (style) => {
		return host.haptics.triggerHapticAsync(style);
	};
}
//#endregion
//#region src/gamepad/RpcGamepadApi.ts
const VALID_SOURCES = [
	"web-gamepad",
	"steam-input",
	"ios-gamecontroller",
	"android-input"
];
const DEFAULT_WINDOW_SIZE = 120;
const DEFAULT_HANDSHAKE_TIMEOUT_MS = 5e3;
const DEFAULT_LATENCY_EMIT_INTERVAL_MS = 5e3;
const LATENCY_EVENT = "gamepad.latency";
function nowMs() {
	return typeof performance !== "undefined" && typeof performance.now === "function" ? performance.now() : Date.now();
}
function finiteOr(value, fallback) {
	return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}
function clamp(value, min, max) {
	return Math.min(max, Math.max(min, value));
}
function integerIndex(raw) {
	if (!raw || typeof raw !== "object") return null;
	const index = raw.index;
	return typeof index === "number" && Number.isInteger(index) ? index : null;
}
function coerceButton(raw) {
	if (raw && typeof raw === "object") {
		const button = raw;
		const pressed = button.pressed === true;
		return {
			pressed,
			value: clamp(finiteOr(button.value, pressed ? 1 : 0), 0, 1)
		};
	}
	return {
		pressed: false,
		value: 0
	};
}
var RpcGamepadApi = class {
	rpc;
	supported = false;
	mode = null;
	tornDown = false;
	/** Set once the handshake settles to an unsupported state. */
	serveDisabled = false;
	cache = /* @__PURE__ */ new Map();
	lastSourceByIndex = /* @__PURE__ */ new Map();
	connectedSubscribers = /* @__PURE__ */ new Set();
	disconnectedSubscribers = /* @__PURE__ */ new Set();
	notificationSubscriptions = [];
	latency;
	reader = null;
	handshakePromise = Promise.resolve();
	pagehideListener = null;
	latencyEmitTimer = null;
	timeoutMs;
	constructor(rpc, options = {}) {
		this.rpc = rpc;
		this.latency = new LatencyTracker({
			windowSize: DEFAULT_WINDOW_SIZE,
			enabled: options.debug === true
		});
		this.timeoutMs = options.timeoutMs ?? DEFAULT_HANDSHAKE_TIMEOUT_MS;
		if (options.debug === true) {
			const intervalMs = options.latencyEmitIntervalMs ?? DEFAULT_LATENCY_EMIT_INTERVAL_MS;
			this.latencyEmitTimer = setInterval(() => this.emitLatency(), intervalMs);
			this.latencyEmitTimer?.unref?.();
		}
		this.notificationSubscriptions.push(rpc.onNotification("GAMEPAD_SNAPSHOT", (p) => this.handleSnapshot(p)), rpc.onNotification("GAMEPAD_CONNECTED", (p) => this.handleConnected(p)), rpc.onNotification("GAMEPAD_DISCONNECTED", (p) => this.handleDisconnected(p)));
		if (typeof window !== "undefined") {
			this.pagehideListener = () => this.teardown();
			window.addEventListener("pagehide", this.pagehideListener);
		}
		if (options.autoSubscribe !== false) this.subscribe();
	}
	/** Issues the awaited `GAMEPAD_SUBSCRIBE` handshake. The host's response is the
	* sole tier authority (MUST-22/23). */
	subscribe() {
		if (this.tornDown) return this.handshakePromise;
		const webGamepadAvailable = canReadWebGamepads();
		this.handshakePromise = this.rpc.call("H5_GAMEPAD_SUBSCRIBE", { webGamepadAvailable }, this.timeoutMs).then((response) => this.applyHandshake(response)).catch(() => this.failHandshake());
		return this.handshakePromise;
	}
	/** Resolves once the handshake settles (success or failure). Never rejects. */
	ready() {
		return this.handshakePromise;
	}
	isSupported() {
		return this.supported && !this.tornDown;
	}
	getGamepads() {
		if (this.tornDown) return [];
		if (this.mode === "tier1") return this.reader ? this.reader.read() : [];
		if (this.serveDisabled) return [];
		return [...this.cache.values()].filter((snapshot) => snapshot.connected);
	}
	onConnected(callback) {
		this.connectedSubscribers.add(callback);
		for (const pad of this.getGamepads()) callback({
			index: pad.index,
			id: pad.id,
			source: pad.source
		});
		return { unsubscribe: () => this.connectedSubscribers.delete(callback) };
	}
	onDisconnected(callback) {
		this.disconnectedSubscribers.add(callback);
		return { unsubscribe: () => this.disconnectedSubscribers.delete(callback) };
	}
	__debug = { getLatencyStats: () => this.latency.getStats() };
	emitLatency() {
		if (this.tornDown) return;
		const stats = this.latency.getStats();
		if (stats.sampleCount === 0) return;
		this.rpc.notify("H5_DEBUG", {
			event: LATENCY_EVENT,
			...stats
		});
	}
	teardown() {
		if (this.tornDown) return;
		this.tornDown = true;
		this.supported = false;
		this.mode = null;
		if (this.latencyEmitTimer !== null) {
			clearInterval(this.latencyEmitTimer);
			this.latencyEmitTimer = null;
		}
		for (const subscription of this.notificationSubscriptions) subscription.unsubscribe();
		this.notificationSubscriptions.length = 0;
		this.stopReader();
		this.cache.clear();
		this.lastSourceByIndex.clear();
		if (this.pagehideListener && typeof window !== "undefined") {
			window.removeEventListener("pagehide", this.pagehideListener);
			this.pagehideListener = null;
		}
		this.rpc.notify("H5_GAMEPAD_UNSUBSCRIBE", {});
	}
	applyHandshake(response) {
		if (this.tornDown) return;
		const mode = parseMode(response);
		if (!mode) {
			this.markUnsupported();
			return;
		}
		this.stopReader();
		this.supported = true;
		this.mode = mode;
		this.serveDisabled = false;
		if (mode === "tier1") {
			this.reader = this.rpc.createWebGamepadReader?.() ?? new WebGamepadReader();
			this.reader.start(() => {}, (event) => this.dispatchConnected(event), (event) => this.dispatchDisconnected(event));
		}
	}
	failHandshake() {
		if (this.tornDown) return;
		this.markUnsupported();
	}
	markUnsupported() {
		this.supported = false;
		this.mode = null;
		this.serveDisabled = true;
		this.cache.clear();
		this.stopReader();
	}
	stopReader() {
		if (this.reader) {
			this.reader.stop();
			this.reader = null;
		}
	}
	handleSnapshot(raw) {
		if (this.tornDown || this.mode !== "tier2" || this.serveDisabled) return;
		const index = integerIndex(raw);
		if (index === null) return;
		const snapshot = this.coerceSnapshot(raw, index);
		this.cache.set(index, snapshot);
		this.lastSourceByIndex.set(index, snapshot.source);
		this.latency.add(snapshot.sourceTimestamp, snapshot.deliveredTimestamp);
	}
	handleConnected(raw) {
		if (this.tornDown || this.mode !== "tier2") return;
		const index = integerIndex(raw);
		if (index === null) return;
		this.dispatchConnected(this.coerceConnection(raw, index));
	}
	handleDisconnected(raw) {
		if (this.tornDown || this.mode !== "tier2") return;
		const index = integerIndex(raw);
		if (index === null) return;
		this.cache.delete(index);
		this.dispatchConnection(this.disconnectedSubscribers, this.coerceConnection(raw, index));
	}
	dispatchConnected(event) {
		this.dispatchConnection(this.connectedSubscribers, event);
	}
	dispatchDisconnected(event) {
		this.dispatchConnection(this.disconnectedSubscribers, event);
	}
	dispatchConnection(subscribers, event) {
		for (const callback of [...subscribers]) callback(event);
	}
	coerceSnapshot(raw, index) {
		const buttons = {};
		const rawButtons = raw.buttons && typeof raw.buttons === "object" ? raw.buttons : {};
		for (const name of GAMEPAD_BUTTON_NAMES) buttons[name] = coerceButton(rawButtons[name]);
		const rawAxes = raw.axes && typeof raw.axes === "object" ? raw.axes : {};
		const axes = {
			leftX: clamp(finiteOr(rawAxes.leftX, 0), -1, 1),
			leftY: clamp(finiteOr(rawAxes.leftY, 0), -1, 1),
			rightX: clamp(finiteOr(rawAxes.rightX, 0), -1, 1),
			rightY: clamp(finiteOr(rawAxes.rightY, 0), -1, 1)
		};
		return {
			index,
			id: typeof raw.id === "string" ? raw.id : "",
			connected: raw.connected === true,
			source: this.resolveSource(raw.source, index),
			standardMapping: raw.standardMapping === true,
			buttons,
			axes,
			sourceTimestamp: finiteOr(raw.sourceTimestamp, nowMs()),
			deliveredTimestamp: finiteOr(raw.deliveredTimestamp, nowMs())
		};
	}
	coerceConnection(raw, index) {
		return {
			index,
			id: typeof raw.id === "string" ? raw.id : "",
			source: this.resolveSource(raw.source, index)
		};
	}
	/** Tier 2 spans multiple providers; trust the host's stamped source, else
	* reuse the last valid source for this index, else any cached pad's source,
	* else an explicitly-arbitrary guard (MUST-26). */
	resolveSource(rawSource, index) {
		if (typeof rawSource === "string" && VALID_SOURCES.includes(rawSource)) return rawSource;
		const lastForIndex = this.lastSourceByIndex.get(index);
		if (lastForIndex) return lastForIndex;
		const anyCached = this.cache.values().next().value;
		if (anyCached) return anyCached.source;
		return "steam-input";
	}
};
function parseMode(response) {
	if (!response || typeof response !== "object") return null;
	const typed = response;
	if (typed.supported !== true) return null;
	if (typed.mode === "tier1" || typed.mode === "tier2") return typed.mode;
	return null;
}
//#endregion
//#region src/gamepad/index.ts
function initializeGamepad(rundotGameApiInstance, host) {
	rundotGameApiInstance.gamepad = host.gamepad;
}
//#endregion
//#region src/iap/RpcIapApi.ts
var RpcIapApi = class {
	rpcClient;
	constructor(rpcClient) {
		this.rpcClient = rpcClient;
	}
	async getHardCurrencyBalance() {
		return await this.rpcClient.call("H5_IAP_GET_WALLET");
	}
	async spendCurrency(productId, cost, options) {
		return await this.rpcClient.callT("H5_IAP_SPEND_CURRENCY", {
			amount: cost,
			productId,
			screenName: options?.screenName,
			description: options?.description,
			beneficiaryId: options?.beneficiaryId,
			contentEntryId: options?.contentEntryId
		}, -1);
	}
	/**
	* gets the subscription packages for a given tier. If no tier is provided, returns all subscription
	* packages for all tiers
	*/
	async getSubscriptions(tier) {
		return await this.rpcClient.callT("H5_IAP_GET_SUBSCRIPTIONS", { tier }, -1);
	}
	/**
	* triggers the checkout for a given subscription, identified by tier and interval.
	* Rejects with a `RundotApiError` (`UNSUPPORTED_SUBSCRIPTION_INTERVAL`) before
	* any checkout when the tier does not offer that interval — LITE is weekly-only.
	* @example
	* // will trigger the checkout for the weekly CORE subscription
	* await purchaseSubscription('CORE', 'weekly')
	*/
	async purchaseSubscription(tier, interval) {
		assertTierSupportsInterval(tier, interval);
		return await this.rpcClient.callT("H5_IAP_PURCHASE_SUBSCRIPTION", {
			tier,
			interval
		}, -1);
	}
	/**
	* Check if a user has a given subscription tier. If the user has a higher
	* subscription tier than the one being checked, this returns true.
	*
	* @example
	* // Returns true if the user has CORE, PLUS, PRIME, or ULTIMATE
	* await isUserSubscribed('CORE');
	*
	* // Returns true only if the user has ULTIMATE
	* await isUserSubscribed('ULTIMATE');
	*/
	async isUserSubscribed(tier) {
		return await this.rpcClient.callT("H5_IAP_GET_PLAYER_SUBSCRIPTION_INFO", { tier }, -1);
	}
	async openStore() {
		return await this.rpcClient.call("H5_IAP_OPEN_STORE", void 0, -1);
	}
	async getCurrencyIcon(options) {
		return await this.rpcClient.callT("H5_IAP_GET_CURRENCY_ICON", options ?? {});
	}
	async hasUserMadePurchase() {
		return await this.rpcClient.call("H5_IAP_HAS_USER_MADE_PURCHASE");
	}
	/**
	* The host scopes this to the running game itself, so no game id is sent.
	* The legacy argument is accepted and ignored for source compatibility.
	*/
	async listDirectPurchaseSkus(_legacyGameId) {
		return await this.rpcClient.callT("H5_IAP_LIST_DIRECT_PURCHASE_SKUS", {}, -1);
	}
};
//#endregion
//#region src/iap/index.ts
function initializeIap(rundotGameApiInstance, host) {
	rundotGameApiInstance.iap = host.iap;
}
//#endregion
//#region src/credits/RpcCreditsApi.ts
var RpcCreditsApi = class {
	rpcClient;
	autoPaywallOnExhaustion = true;
	autoRetryOnPurchase = true;
	constructor(rpcClient) {
		this.rpcClient = rpcClient;
	}
	async getBillingContext() {
		return this.rpcClient.call("H5_CREDITS_GET_CONTEXT");
	}
	async getBalance() {
		return this.rpcClient.call("H5_CREDITS_GET_BALANCE");
	}
	async getSubscription() {
		return this.rpcClient.call("H5_CREDITS_GET_SUBSCRIPTION");
	}
	async getPlans() {
		const catalog = await this.rpcClient.call("H5_CREDITS_GET_PLANS");
		return {
			...catalog,
			plansUnavailable: catalog.plansUnavailable === true
		};
	}
	async estimateGenerationCost(request) {
		return this.rpcClient.callT("H5_CREDITS_ESTIMATE_GENERATION_COST", request);
	}
	async openPaywall(options) {
		return this.rpcClient.callT("H5_CREDITS_OPEN_PAYWALL", options ?? {}, -1);
	}
	setAutoPaywallOnExhaustion(enabled) {
		this.autoPaywallOnExhaustion = enabled;
		this.pushConfig({ autoPaywallOnExhaustion: enabled });
	}
	getAutoPaywallOnExhaustion() {
		return this.autoPaywallOnExhaustion;
	}
	setAutoRetryOnPurchase(enabled) {
		this.autoRetryOnPurchase = enabled;
		this.pushConfig({ autoRetryOnPurchase: enabled });
	}
	getAutoRetryOnPurchase() {
		return this.autoRetryOnPurchase;
	}
	onBalanceChanged(listener) {
		const subscription = this.rpcClient.onNotification("CREDITS_BALANCE_UPDATE", listener);
		return () => subscription.unsubscribe();
	}
	pushConfig(patch) {
		this.rpcClient.notify("H5_CREDITS_SET_CONFIG", patch);
	}
};
//#endregion
//#region src/credits/index.ts
function initializeCredits(rundotGameApiInstance, host) {
	rundotGameApiInstance.credits = host.credits;
}
//#endregion
//#region src/lifecycles/RpcLifecycleApi.ts
const RESUME_RECOVERY_GRACE_MS = 1500;
var RpcLifecycleApi = class {
	rpcClient;
	backButtonHandlerRegistered = false;
	lifecycleState = "unknown";
	resumeCallbacks = /* @__PURE__ */ new Set();
	resumeRecoveryTimer = null;
	/**
	* Boot-window tap buffer. The host drains a stashed tap the instant the
	* SDK's INTERNAL context subscriber acks (`SUBSCRIBE_READY`, inside
	* `initialize()`), which is necessarily before game code can call
	* `onNotification` — that only happens after `initialize()` resolves.
	* `wireNotificationReplay` (registered before INIT, like the identity
	* replica) parks that early event here; the first public subscriber gets it
	* replayed once. `null` = nothing pending.
	*/
	pendingNotification = null;
	notificationSubscriberCount = 0;
	constructor(rpcClient) {
		this.rpcClient = rpcClient;
		this.rpcClient.onNotification("PAUSE", () => {
			this.markPaused();
		});
		this.rpcClient.onNotification("SLEEP", () => {
			this.markPaused();
		});
		this.rpcClient.onNotification("RESUME", () => {
			this.handleResume();
		});
		this.rpcClient.onNotification("QUIT", () => {
			this.lifecycleState = "quit";
			this.cancelResumeRecovery();
		});
	}
	/**
	* MUST be called during host initialization, BEFORE the INIT_SDK call, so
	* this subscription precedes the host's SUBSCRIBE_READY stash drain
	* (RpcClient fans out in registration order; a drain that raced ahead of
	* this wire would be unbufferable).
	*/
	wireNotificationReplay() {
		return this.rpcClient.onNotification("NOTIFICATION_PARAMS_UPDATE", (params) => {
			if (this.notificationSubscriberCount === 0) this.pendingNotification = { params: params ?? {} };
		});
	}
	onQuit(callback) {
		return this.rpcClient.onNotification("QUIT", callback);
	}
	onSleep(callback) {
		return this.rpcClient.onNotification("SLEEP", callback);
	}
	onAwake(callback) {
		return this.rpcClient.onNotification("AWAKE", callback);
	}
	onResume(callback) {
		this.resumeCallbacks.add(callback);
		return { unsubscribe: () => {
			this.resumeCallbacks.delete(callback);
		} };
	}
	onPause(callback) {
		return this.rpcClient.onNotification("PAUSE", callback);
	}
	onIdentityChanged(callback) {
		return this.rpcClient.onNotification("IDENTITY_CHANGED", callback);
	}
	onNotification(callback) {
		this.notificationSubscriberCount += 1;
		const inner = this.rpcClient.onNotification("NOTIFICATION_PARAMS_UPDATE", (params) => callback({ params: params ?? {} }));
		const pending = this.pendingNotification;
		if (pending) {
			this.pendingNotification = null;
			queueMicrotask(() => callback(pending));
		}
		let unsubscribed = false;
		return { unsubscribe: () => {
			if (unsubscribed) return;
			unsubscribed = true;
			this.notificationSubscriberCount -= 1;
			inner.unsubscribe();
		} };
	}
	onSafeAreaChanged(callback) {
		return this.rpcClient.onNotification("H5_SAFE_AREA_CHANGED", callback);
	}
	onDeviceChanged(callback) {
		return this.rpcClient.onNotification("H5_DEVICE_CHANGED", callback);
	}
	scheduleResumeRecovery(isVisible) {
		if (this.lifecycleState === "quit" || this.resumeRecoveryTimer !== null) return;
		this.resumeRecoveryTimer = setTimeout(() => {
			this.resumeRecoveryTimer = null;
			if (this.lifecycleState !== "paused" || !isVisible()) return;
			this.rpcClient.notify("H5_REQUEST_LIFECYCLE_RESUME");
		}, RESUME_RECOVERY_GRACE_MS);
	}
	cancelResumeRecovery() {
		if (this.resumeRecoveryTimer === null) return;
		clearTimeout(this.resumeRecoveryTimer);
		this.resumeRecoveryTimer = null;
	}
	markPaused() {
		if (this.lifecycleState === "quit") return;
		this.lifecycleState = "paused";
	}
	handleResume() {
		this.cancelResumeRecovery();
		if (this.lifecycleState === "quit" || this.lifecycleState === "running") return;
		this.lifecycleState = "running";
		for (const callback of [...this.resumeCallbacks]) callback();
	}
	onBackButton(callback) {
		const inner = this.rpcClient.onNotification("BACK_BUTTON", callback);
		if (!this.backButtonHandlerRegistered) {
			this.backButtonHandlerRegistered = true;
			this.rpcClient.call("H5_BACK_BUTTON_HANDLER_SET", { active: true }).catch(() => {});
		}
		let unsubscribed = false;
		return { unsubscribe: () => {
			if (unsubscribed) return;
			unsubscribed = true;
			inner.unsubscribe();
			this.backButtonHandlerRegistered = false;
			this.rpcClient.call("H5_BACK_BUTTON_HANDLER_SET", { active: false }).catch(() => {});
		} };
	}
};
//#endregion
//#region src/access-gate/sanitizeProfile.ts
/**
* Canonicalizes a profile into the exact 4-field shape stored on
* `RundotGameAPI._profileData`. The single source of truth for this shape:
* INIT_SDK, promptLogin, and the IDENTITY_CHANGED replica handler must all
* produce byte-identical objects so last-write-wins between them is a no-op.
*/
function sanitizeProfile(profile) {
	return {
		id: profile.id,
		username: profile.username,
		avatarUrl: profile.avatarUrl ?? null,
		isAnonymous: Boolean(profile.isAnonymous)
	};
}
//#endregion
//#region src/lifecycles/wireIdentityReplica.ts
/**
* Subscribes an internal handler that overwrites `rundotGameApi._profileData`
* with the canonical profile the instant an IDENTITY_CHANGED notification
* arrives. RemoteHost MUST call this during initialization, before any game
* code subscribes via `lifecycle.onIdentityChanged`, so that the replica is
* already up to date when game callbacks run (RpcClient fans out to
* subscribers in registration order). A game reading `api.profile` inside its
* own handler then sees the new identity, not the stale one.
*/
function wireIdentityReplica(rpcClient, rundotGameApi) {
	return rpcClient.onNotification("IDENTITY_CHANGED", (event) => {
		if (event?.profile) rundotGameApi._profileData = sanitizeProfile(event.profile);
	});
}
//#endregion
//#region src/lifecycles/wireViewportReplica.ts
/**
* Subscribes internal handlers that keep `rundotGameApi._safeAreaData` and
* `rundotGameApi._deviceData` live the instant `H5_SAFE_AREA_CHANGED` or
* `H5_DEVICE_CHANGED` notifications arrive from the host.
*
* RemoteHost MUST call this during initialization BEFORE `INIT_SDK` so that:
* 1. The replica is registered before any game callbacks via `lifecycles.onSafeAreaChanged`
*    or `lifecycles.onDeviceChanged` (RpcClient fans out to subscribers in registration order).
* 2. When a game's listener runs, reading `RundotGameAPI.system.getSafeArea()` or
*    `RundotGameAPI.device.getDevice()` returns the updated data, not stale state.
*/
function wireViewportReplica(rpcClient, rundotGameApi) {
	const safeAreaSub = rpcClient.onNotification("H5_SAFE_AREA_CHANGED", (insets) => {
		applySafeAreaUpdate(rundotGameApi, insets);
	});
	const deviceSub = rpcClient.onNotification("H5_DEVICE_CHANGED", (device) => {
		if (device) rundotGameApi._deviceData = device;
	});
	return { unsubscribe: () => {
		safeAreaSub.unsubscribe();
		deviceSub.unsubscribe();
	} };
}
//#endregion
//#region src/lifecycles/index.ts
function initializeLifecycleApi(rundotGameApi, host) {
	rundotGameApi.lifecycles = host.lifecycle;
}
//#endregion
//#region src/logging/RpcLoggingApi.ts
var RpcLoggingApi = class {
	host;
	rpcClient;
	constructor(host, rpcClient) {
		this.host = host;
		this.rpcClient = rpcClient;
	}
	logDebug(message, ...args) {
		if (!this.host.isInitialized) {
			console.log(message, args);
			return;
		}
		this.rpcClient.notify("H5_DEBUG", {
			level: "log",
			message: this.buildMessage(message, ...args)
		});
	}
	logError(message, ...args) {
		if (!this.host.isInitialized) {
			console.error(message, ...args);
			return;
		}
		this.rpcClient.notify("H5_DEBUG", {
			level: "error",
			message: this.buildMessage(message, ...args)
		});
	}
	buildMessage(message, ...args) {
		if (args && args.length > 0) {
			const stringArgs = [];
			for (const arg of args) {
				const argAsString = this.toStringArg(arg);
				if (argAsString) stringArgs.push(argAsString);
			}
			message += stringArgs.join(" ");
		}
		return message;
	}
	toStringArg(arg) {
		if (arg instanceof Error) return `${arg.name}: ${arg.message}`;
		if (arg) {
			if (typeof arg === "object") try {
				return JSON.stringify(arg);
			} catch (e) {
				return String(arg);
			}
			return String(arg);
		}
	}
};
//#endregion
//#region src/logging/index.ts
function initializeLoggingApi(rundotGameApi, host) {
	rundotGameApi.log = (message, ...args) => {
		return host.logging.logDebug(message, ...args);
	};
	rundotGameApi.error = (message, ...args) => {
		return host.logging.logError(message, ...args);
	};
}
//#endregion
//#region src/navigation/RpcNavigationApi.ts
var RpcNavigationApi = class {
	rundotGameApi;
	rpcClient;
	constructor(rpcClient, rundotGameApi) {
		this.rpcClient = rpcClient;
		this.rundotGameApi = rundotGameApi;
	}
	async requestPopOrQuit(options) {
		return (await this.rpcClient.call("QUIT", options)).success;
	}
	getStackInfo() {
		this.rundotGameApi;
		return window.rundotGame._config.context?.stack || {
			isInStack: false,
			stackPosition: 0,
			parentInstanceId: null,
			appType: "standalone"
		};
	}
	popApp() {
		return this.rpcClient.call("H5_STACK_POP_REQUEST");
	}
	pushApp(appId, options) {
		return this.rpcClient.call("H5_STACK_PUSH_REQUEST", {
			targetAppId: appId,
			contextData: options?.contextData,
			appParams: options?.appParams
		});
	}
	navigateToGame(targetGameId, options) {
		return this.rpcClient.call("H5_NAVIGATE_TO_GAME", {
			targetGameId,
			launchContext: options?.launchContext,
			returnContext: options?.returnContext
		});
	}
};
//#endregion
//#region src/navigation/index.ts
function initializeStackNavigation(rundotGameApi, host) {
	rundotGameApi._mock.stackState = {
		isInStack: false,
		stackPosition: 0,
		stackDepth: 0,
		isTopOfStack: false,
		parentInstanceId: null,
		stackHistory: []
	};
	rundotGameApi.pushAppAsync = host.navigation.pushApp.bind(host.navigation);
	rundotGameApi.popAppAsync = host.navigation.popApp.bind(host.navigation);
	rundotGameApi.getStackInfo = host.navigation.getStackInfo.bind(host.navigation);
	rundotGameApi.requestPopOrQuit = (options) => {
		return host.navigation.requestPopOrQuit(options);
	};
	rundotGameApi.navigateToGame = host.navigation.navigateToGame.bind(host.navigation);
}
//#endregion
//#region src/notifications/deprecationNote.ts
const STORAGE_PREFIX = "rundot_sdk_deprecation_note_";
function defaultGetLastNotedDay(key) {
	try {
		if (typeof localStorage === "undefined") return null;
		return localStorage.getItem(`${STORAGE_PREFIX}${key}`);
	} catch {
		return null;
	}
}
function defaultSetLastNotedDay(key, day) {
	try {
		if (typeof localStorage === "undefined") return;
		localStorage.setItem(`${STORAGE_PREFIX}${key}`, day);
	} catch {}
}
function defaultToday() {
	return (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
}
function noteDeprecationOncePerUtcDay(key, message, eventName, deps = {}) {
	const today = deps.today ?? defaultToday;
	const getLastNotedDay = deps.getLastNotedDay ?? defaultGetLastNotedDay;
	const setLastNotedDay = deps.setLastNotedDay ?? defaultSetLastNotedDay;
	const warn = deps.warn ?? ((m) => console.warn(m));
	const day = today();
	if (getLastNotedDay(key) === day) return;
	setLastNotedDay(key, day);
	warn(message);
	deps.recordEvent?.(eventName);
}
//#endregion
//#region src/notifications/RpcNotificationsApi.ts
var RpcNotificationsApi = class {
	rpcClient;
	options;
	constructor(rpcClient, options = {}) {
		this.rpcClient = rpcClient;
		this.options = options;
	}
	async submitMessageAsync(input) {
		return await this.rpcClient.call("H5_MESSAGING_SUBMIT_MESSAGE", input);
	}
	async scheduleAsync(title, body, seconds, notificationId, options) {
		noteDeprecationOncePerUtcDay("schedule_async", "scheduleAsync is deprecated; use submitMessageAsync({ channels: [\"local\"], ... }) instead.", "sdk_deprecated_schedule_async", this.deprecationDeps());
		const { priority = 50, groupId, payload } = options || {};
		const local = (await this.submitMessageAsync({
			channels: ["local"],
			title,
			body,
			delaySeconds: seconds,
			notificationId,
			priority,
			groupId,
			payload
		})).results.find((r) => r.channel === "local");
		if (local?.status === "scheduled" && local.id) return local.id;
		return null;
	}
	async cancelNotification(id) {
		const result = await this.rpcClient.call("H5_CANCEL_LOCAL_NOTIFICATION", { id });
		return result.cancelled ?? result.canceled ?? false;
	}
	async getAllScheduledLocalNotifications() {
		return (await this.rpcClient.call("H5_GET_ALL_SCHEDULED_LOCAL_NOTIFICATIONS", {})).notifications.map((notif) => {
			return {
				id: notif.identifier,
				title: notif.content.title,
				body: notif.content.body,
				payload: notif.content.data,
				trigger: notif.trigger
			};
		});
	}
	async isLocalNotificationsEnabled() {
		return (await this.rpcClient.call("H5_IS_LOCAL_NOTIFICATIONS_ENABLED", {})).enabled;
	}
	async setLocalNotificationsEnabled(enabled) {
		return (await this.rpcClient.call("H5_SET_LOCAL_NOTIFICATIONS_ENABLED", { enabled })).enabled;
	}
	async getRCSAvailableAsync() {
		return await this.rpcClient.call("H5_MESSAGING_GET_RCS_AVAILABLE", {});
	}
	async scheduleRCSAsync(input) {
		noteDeprecationOncePerUtcDay("schedule_rcs_async", "scheduleRCSAsync is deprecated; use submitMessageAsync({ channels: [\"rcs\"], ... }) instead.", "sdk_deprecated_schedule_rcs", this.deprecationDeps());
		const result = await this.submitMessageAsync({
			channels: ["rcs"],
			title: input.title,
			body: input.body,
			ctaUrl: input.ctaUrl,
			continuationParams: input.continuationParams,
			image: input.image,
			triggerAt: input.triggerAt,
			delaySeconds: input.delaySeconds
		});
		const rcs = result.results.find((r) => r.channel === "rcs");
		if (rcs?.status === "scheduled" && rcs.id) return {
			scheduleId: rcs.id,
			status: "pending"
		};
		if (rcs?.status === "skipped") return {
			scheduleId: result.messageId,
			status: "skipped",
			...rcs.reason !== void 0 ? { reason: rcs.reason } : {}
		};
		return {
			scheduleId: result.messageId,
			status: "failed"
		};
	}
	async requestRCSOptInAsync(input) {
		return await this.rpcClient.call("H5_MESSAGING_REQUEST_RCS_OPT_IN", input ?? {});
	}
	deprecationDeps() {
		return {
			today: this.options.today,
			getLastNotedDay: this.options.getLastNotedDay,
			setLastNotedDay: this.options.setLastNotedDay,
			warn: this.options.warn,
			recordEvent: this.options.recordDeprecationEvent
		};
	}
};
//#endregion
//#region src/notifications/index.ts
function initializeLocalNotifications(rundotGameApi, host) {
	rundotGameApi.notifications = host.notifications;
}
//#endregion
//#region src/popups/RpcPopupsApi.ts
const SHOW_TIMEOUT_MS = 6e5;
const CAN_SHOW_TIMEOUT_MS = 1e4;
var RpcPopupsApi = class {
	rpcClient;
	constructor(rpcClient) {
		this.rpcClient = rpcClient;
	}
	async showToast(message, options) {
		const duration = options?.duration ?? 3e3;
		const variant = options?.variant ?? "info";
		return (await this.rpcClient.call("H5_TOAST", {
			message,
			duration,
			variant,
			action: options?.action
		}, duration + 2e3)).actionTriggered;
	}
	async showLikeDialog() {
		return this.rpcClient.call("H5_LIKE_DIALOG", {}, SHOW_TIMEOUT_MS);
	}
	async canShowLikeDialog() {
		return this.rpcClient.call("H5_LIKE_DIALOG_CAN_SHOW", {}, CAN_SHOW_TIMEOUT_MS);
	}
	async showCommentsPanel() {
		return this.rpcClient.call("H5_COMMENTS_PANEL", {}, SHOW_TIMEOUT_MS);
	}
	async canShowCommentsPanel() {
		return this.rpcClient.call("H5_COMMENTS_PANEL_CAN_SHOW", {}, CAN_SHOW_TIMEOUT_MS);
	}
	async getLikeState() {
		return this.rpcClient.call("H5_LIKE_STATE", {}, CAN_SHOW_TIMEOUT_MS);
	}
};
//#endregion
//#region src/popups/index.ts
function initializePopups(rundotGameApi, host) {
	rundotGameApi.popups = host.popups;
}
//#endregion
//#region src/profile/HostProfileApi.ts
var HostProfileApi = class {
	rundotGameApi;
	constructor(rundotGameApi) {
		this.rundotGameApi = rundotGameApi;
	}
	getCurrentProfile() {
		const profile = this.rundotGameApi._profileData;
		if (!profile) throw new Error("[RUN] Profile not available. You must await RundotGameAPI.initializeAsync() before calling getProfile(). INIT_SDK has not completed.");
		if (!profile.id || !profile.username) throw new Error("[RUN] INIT_SDK returned an incomplete profile (missing id/username). The host must supply valid profile data.");
		return {
			id: profile.id,
			username: profile.username,
			avatarUrl: profile.avatarUrl,
			isAnonymous: profile.isAnonymous
		};
	}
};
//#endregion
//#region src/profile/MockProfileApi.ts
var MockProfileApi = class {
	rundotGameApi;
	constructor(rundotGameApi) {
		this.rundotGameApi = rundotGameApi;
	}
	getCurrentProfile() {
		return {
			id: "mock_profile_123",
			name: "Mock User",
			username: "mockuser",
			isAnonymous: false
		};
	}
};
//#endregion
//#region src/profile/index.ts
/** @deprecated Use `PlaygroundProfileApi`. */
var SandboxProfileApi = class extends PlaygroundProfileApi {
	constructor(...args) {
		warnRenamed("SandboxProfileApi", "PlaygroundProfileApi");
		super(...args);
	}
};
function initializeProfile(rundotGameApi, host) {
	rundotGameApi.getProfile = () => {
		return host.profile.getCurrentProfile();
	};
	rundotGameApi.getCurrentProfile = () => {
		console.warn("[RUN] DEPRECATED: RundotGameAPI.getCurrentProfile() is deprecated. Use RundotGameAPI.getProfile() instead. See migration guide: https://docs.rundot-game.com/migration/profile-api");
		return host.profile.getCurrentProfile();
	};
}
//#endregion
//#region src/rpc/RpcClient.ts
var RpcClient = class {
	pendingCalls = /* @__PURE__ */ new Map();
	notificationCallbacks = /* @__PURE__ */ new Map();
	onResponseSub = null;
	onNotificationSub = null;
	transport = null;
	start(transport) {
		this.transport = transport;
		this.onResponseSub = transport.onResponse(async (response) => {
			return this.handleRpcResponse(response);
		});
		this.onNotificationSub = transport.onNotification(async (notification) => {
			return this.handleRpcNotification(notification);
		});
	}
	stop() {
		if (this.onResponseSub) {
			this.onResponseSub.unsubscribe();
			this.onResponseSub = null;
		}
		if (this.onNotificationSub) {
			this.onNotificationSub.unsubscribe();
			this.onNotificationSub = null;
		}
		this.transport = null;
	}
	onNotification(id, callback) {
		const typed = callback;
		let subscribers = this.notificationCallbacks.get(id);
		if (!subscribers) {
			subscribers = /* @__PURE__ */ new Set();
			this.notificationCallbacks.set(id, subscribers);
		}
		subscribers.add(typed);
		return { unsubscribe: () => {
			const set = this.notificationCallbacks.get(id);
			if (!set) return;
			set.delete(typed);
			if (set.size === 0) this.notificationCallbacks.delete(id);
		} };
	}
	callT(method, args, timeout = 6e4) {
		return this.call(method, args, timeout);
	}
	async call(method, args, timeout = 6e4) {
		return new Promise((resolve, reject) => {
			const id = generateId();
			this.addPendingCall(id, (value) => resolve(value), (error) => reject(error));
			const request = {
				type: "rpc-request",
				id,
				method,
				args
			};
			if (this.transport) this.transport.sendRequest(request);
			if (timeout > 0) {
				const startTime = Date.now();
				setTimeout(() => {
					if (this.hasPendingCall(id)) {
						this.removePendingCall(id);
						const elapsed = Date.now() - startTime;
						console.error(`[RpcClient] TIMEOUT: ${method} after ${elapsed}ms (limit: ${timeout}ms)`, {
							method,
							id,
							args: this.safeStringifyArgs(args).substring(0, 500),
							timeout,
							elapsed,
							timestamp: (/* @__PURE__ */ new Date()).toISOString()
						});
						reject(new RundotApiError("TIMEOUT", `RPC call ${method} timed out after ${elapsed}ms`, 0));
					}
				}, timeout);
			}
		});
	}
	/**
	* Send a fire-and-forget RPC request.
	*
	* Unlike `call()`, `notify()`:
	*   - does NOT register a pending call,
	*   - does NOT arm a timeout,
	*   - does NOT await or surface the host's response.
	*
	* Use this for telemetry / cleanup RPCs where the caller does not care about
	* the result and does not want spurious timeout errors when the iframe is
	* throttled (e.g. backgrounded tab) or the host's response is otherwise
	* late. Host-side errors are NOT surfaced to the caller.
	*
	* The wire format is identical to `call()` (an `rpc-request` with a
	* generated id), so any late response from the host is harmlessly dropped
	* by `handleRpcResponse` — there is no entry in `pendingCalls` to match.
	*/
	notify(method, args) {
		const request = {
			type: "rpc-request",
			id: generateId(),
			method,
			args
		};
		if (this.transport) this.transport.sendRequest(request);
	}
	hasPendingCall(id) {
		return this.pendingCalls.has(id);
	}
	safeStringifyArgs(args) {
		if (args === void 0) return "undefined";
		if (args === null) return "null";
		try {
			const serialized = JSON.stringify(args);
			if (serialized === void 0) return "undefined";
			return serialized;
		} catch (error) {
			return `[unserializable args: ${String(error)}]`;
		}
	}
	addPendingCall(id, resolve, reject) {
		this.pendingCalls.set(id, {
			id,
			resolve,
			reject
		});
	}
	removePendingCall(id) {
		this.pendingCalls.delete(id);
	}
	getPendingCall(id) {
		return this.pendingCalls.get(id);
	}
	handleRpcResponse(response) {
		const pending = this.getPendingCall(response.id);
		if (!pending) return false;
		this.removePendingCall(response.id);
		if (response.error) {
			const { message, code, detail, errorDetail, retryAfterMs } = response.error;
			if (code === "RATE_LIMITED") {
				pending.reject(new RateLimitedError(retryAfterMs ?? 1e3, message));
				return true;
			}
			pending.reject(new RundotApiError(code ?? "UNKNOWN", message, 0, detail, errorDetail));
			return true;
		}
		pending.resolve(response.result);
		return true;
	}
	handleRpcNotification(notification) {
		const subscribers = this.notificationCallbacks.get(notification.id);
		if (!subscribers) return;
		for (const callback of [...subscribers]) callback(notification.payload);
	}
};
//#endregion
//#region src/imageGen/RpcImageGenApi.ts
var RpcImageGenApi = class {
	rpcClient;
	constructor(rpcClient) {
		this.rpcClient = rpcClient;
	}
	async generate(params) {
		assertValidImageGenSeed(params.seed);
		return mapCreditsExhaustion(this.rpcClient.call("H5_IMAGE_GEN_GENERATE", params, -1));
	}
	async estimateDepth(params) {
		return mapCreditsExhaustion(this.rpcClient.call("H5_IMAGE_GEN_ESTIMATE_DEPTH", params, -1));
	}
	async removeBackground(params) {
		return mapCreditsExhaustion(this.rpcClient.call("H5_IMAGE_GEN_REMOVE_BACKGROUND", params, -1));
	}
	async upscaleImage(params) {
		return mapCreditsExhaustion(this.rpcClient.call("H5_IMAGE_GEN_UPSCALE_IMAGE", params, -1));
	}
	/**
	* The host scopes this to the running game itself, so no game id is sent.
	* The legacy argument is accepted and ignored for source compatibility.
	*/
	async listModels(legacyGameId) {
		return this.rpcClient.call("H5_IMAGE_GEN_LIST_MODELS", {});
	}
	async getCompletedJobs() {
		return this.rpcClient.call("H5_POLL_COMPLETED_JOBS", { type: "imageGen" });
	}
};
//#endregion
//#region src/imageGen/MockImageGenApi.ts
var MockImageGenApi = class {
	async generate(_params) {
		console.warn("[RUN] Image generation API not available in mock mode");
		throw new Error("Image generation API requires backend connection");
	}
	async estimateDepth(_params) {
		throw new Error("Depth estimation requires backend connection");
	}
	async removeBackground(_params) {
		throw new Error("Background removal requires backend connection");
	}
	async upscaleImage(_params) {
		throw new Error("Image upscaling requires backend connection");
	}
	/** The legacy `gameId` argument is ignored; the mock always requires a backend. */
	async listModels(_legacyGameId) {
		console.warn("[RUN] Image gen models API not available in mock mode");
		throw new Error("Image gen models API requires backend connection");
	}
	async getCompletedJobs() {
		return [];
	}
};
//#endregion
//#region src/imageGen/index.ts
function initializeImageGen(rundotGameApi, host) {
	rundotGameApi.imageGen = host.imageGen;
}
//#endregion
//#region src/spriteGen/RpcSpriteGenApi.ts
/**
* @deprecated RundotGameAPI.spriteGen is deprecated.
*/
var RpcSpriteGenApi = class {
	rpcClient;
	constructor(rpcClient) {
		this.rpcClient = rpcClient;
	}
	warn() {
		warnDeprecated("RundotGameAPI.spriteGen", "[RUN] RundotGameAPI.spriteGen is deprecated.");
	}
	async generate(params) {
		this.warn();
		return mapCreditsExhaustion(this.rpcClient.call("H5_SPRITE_GEN_GENERATE", params, -1));
	}
	async animate(params) {
		this.warn();
		return mapCreditsExhaustion(this.rpcClient.call("H5_SPRITE_GEN_ANIMATE", params, -1));
	}
	async characterAnimate(params) {
		this.warn();
		return this.rpcClient.call("H5_SPRITE_GEN_CHARACTER_ANIMATE", params, -1);
	}
	async listCharacterWorkflows() {
		this.warn();
		return this.rpcClient.call("H5_SPRITE_GEN_LIST_CHARACTER_WORKFLOWS", {});
	}
	async listModels() {
		this.warn();
		return this.rpcClient.call("H5_SPRITE_GEN_LIST_MODELS", {});
	}
	async getCosts() {
		this.warn();
		return this.rpcClient.call("H5_SPRITE_GEN_GET_COSTS", {});
	}
	async getCompletedJobs() {
		this.warn();
		return this.rpcClient.call("H5_POLL_COMPLETED_JOBS", { type: "spriteGen" });
	}
};
//#endregion
//#region src/spriteGen/MockSpriteGenApi.ts
var MockSpriteGenApi = class {
	async generate(_params) {
		console.warn("[RUN] Sprite generation API not available in mock mode");
		throw new Error("Sprite generation API requires backend connection");
	}
	async animate(_params) {
		console.warn("[RUN] Sprite animation API not available in mock mode");
		throw new Error("Sprite animation API requires backend connection");
	}
	async characterAnimate(_params) {
		console.warn("[RUN] Character animate API not available in mock mode");
		throw new Error("Character animate API requires backend connection");
	}
	async listCharacterWorkflows() {
		console.warn("[RUN] Character workflows API not available in mock mode");
		throw new Error("Character workflows API requires backend connection");
	}
	async listModels() {
		console.warn("[RUN] Sprite models API not available in mock mode");
		throw new Error("Sprite models API requires backend connection");
	}
	async getCosts() {
		console.warn("[RUN] Sprite costs API not available in mock mode");
		throw new Error("Sprite costs API requires backend connection");
	}
	async getCompletedJobs() {
		return [];
	}
};
//#endregion
//#region src/spriteGen/index.ts
/**
* @deprecated RundotGameAPI.spriteGen is deprecated.
*/
function initializeSpriteGen(rundotGameApi, host) {
	const delegate = host.spriteGen;
	const warn = () => {
		warnDeprecated("RundotGameAPI.spriteGen", "[RUN] RundotGameAPI.spriteGen is deprecated.");
	};
	rundotGameApi.spriteGen = {
		generate(params) {
			warn();
			return delegate.generate(params);
		},
		animate(params) {
			warn();
			return delegate.animate(params);
		},
		characterAnimate(params) {
			warn();
			return delegate.characterAnimate(params);
		},
		listCharacterWorkflows() {
			warn();
			return delegate.listCharacterWorkflows();
		},
		listModels() {
			warn();
			return delegate.listModels();
		},
		getCosts() {
			warn();
			return delegate.getCosts();
		},
		getCompletedJobs() {
			warn();
			return delegate.getCompletedJobs();
		}
	};
}
//#endregion
//#region src/rooms/setupRoomNotifications.ts
/**
* Invoke callbacks with error handling. Logs and rethrows to fail loudly.
*/
function invokeCallbacks(callbacks, event, context) {
	callbacks.forEach((callback) => {
		try {
			callback(event);
		} catch (error) {
			console.error(`[RUN] Error in ${context} callback:`, error);
			throw error;
		}
	});
}
/**
* Set up room notification listeners using the transport's onRundotGameMessage hook.
* This routes host-sent room notifications (H5_ROOM_DATA_UPDATED, etc.) to the
* callbacks registered in the RoomsApi instance.
* @param transport The RUN.world transport to listen for messages
* @param getSubscriptions Function to retrieve subscription state from RoomsApi
*/
function setupRoomNotifications(transport, getSubscriptions) {
	return transport.onRundotGameMessage((message) => {
		const subscriptions = getSubscriptions();
		if (!subscriptions) return;
		if (message.type === "H5_ROOM_DATA_UPDATED") {
			const messageData = message.data;
			const { roomId, roomData } = messageData;
			if (!roomId) return;
			invokeCallbacks(subscriptions.data[roomId] || [], {
				type: "H5_ROOM_DATA_UPDATED",
				roomId,
				roomData,
				timestamp: messageData.timestamp
			}, "room data");
		}
		if (message.type === "H5_ROOM_MESSAGE_RECEIVED" || message.type === "H5_ROOM_MESSAGE_UPDATED" || message.type === "H5_ROOM_MESSAGE_DELETED") {
			const messageData = message.data;
			const { roomId } = messageData;
			if (!roomId) return;
			invokeCallbacks(subscriptions.messages[roomId] || [], {
				type: message.type,
				roomId,
				message: messageData.message,
				timestamp: messageData.timestamp
			}, "room message");
		}
		if (message.type === "app:h5:proposedMoveValidationUpdated") {
			const messageData = message.data;
			const { roomId } = messageData;
			if (!roomId) return;
			invokeCallbacks(subscriptions.gameEvents[roomId] || [], {
				type: "app:h5:proposedMoveValidationUpdated",
				roomId,
				proposedMoveData: messageData.proposedMoveData,
				proposedMoveId: messageData.proposedMoveId,
				changeType: messageData.changeType,
				timestamp: messageData.timestamp
			}, "game event");
		}
	});
}
//#endregion
//#region src/rooms/RpcRoomsApi.ts
var RpcRoomsApi = class {
	rpcClient;
	subscriptions;
	constructor(rpcClient) {
		this.rpcClient = rpcClient;
		this.subscriptions = {
			data: {},
			messages: {},
			gameEvents: {}
		};
	}
	/**
	* Get the subscription state for external access (used by setupRoomNotifications)
	*/
	getSubscriptions() {
		return this.subscriptions;
	}
	/**
	* Set up room notification routing from the transport
	*/
	setupNotifications(transport) {
		setupRoomNotifications(transport, () => this.getSubscriptions());
	}
	async createRoomAsync(options) {
		const response = await this.rpcClient.call("H5_ROOM_CREATE", { options });
		return new RundotGameRoom(response.room);
	}
	async joinOrCreateRoomAsync(options) {
		const response = await this.rpcClient.call("H5_ROOM_JOIN_OR_CREATE", { options });
		return {
			action: response.action,
			room: new RundotGameRoom(response.room),
			playersJoined: response.playersJoined
		};
	}
	async joinRoomByCodeAsync(roomCode) {
		const response = await this.rpcClient.call("H5_ROOM_JOIN_BY_CODE", { roomCode });
		return new RundotGameRoom(response.room);
	}
	async getUserRoomsAsync(options = {}) {
		const response = await this.rpcClient.call("H5_ROOM_GET_USER_ROOMS", { includeArchived: options.includeArchived ?? false });
		const rawRooms = Array.isArray(response) ? response : response?.rooms;
		if (!Array.isArray(rawRooms)) {
			console.warn("[RUN] getUserRoomsAsync: Unexpected response format:", response);
			return [];
		}
		const rundotGameRooms = [];
		for (const roomData of rawRooms) {
			if (!roomData.id) {
				console.warn("[RUN] getUserRooms: Skipping room with missing ID:", roomData);
				continue;
			}
			try {
				const rundotGameRoom = new RundotGameRoom(roomData);
				rundotGameRooms.push(rundotGameRoom);
			} catch (error) {
				console.warn("[RUN] getUserRooms: Failed to create RundotGameRoom object:", error, roomData);
			}
		}
		return rundotGameRooms;
	}
	/** @deprecated Rooms V1 is unsupported. Hold state in your realtime `GameRoom` class. */
	async updateRoomDataAsync(room, updates, options = {}) {
		await this.rpcClient.call("H5_ROOM_UPDATE_DATA", {
			roomId: room.id,
			updates,
			merge: options.merge ?? true
		});
	}
	async getRoomDataAsync(room) {
		return await this.rpcClient.call("H5_ROOM_GET_DATA", { roomId: room.id });
	}
	async sendRoomMessageAsync(rundotGameRoom, request) {
		return await this.rpcClient.call("H5_ROOM_SEND_MESSAGE", {
			roomId: rundotGameRoom.id,
			message: request.message,
			metadata: request.metadata
		});
	}
	async leaveRoomAsync(room) {
		await this.rpcClient.call("H5_ROOM_LEAVE", { roomId: room.id });
	}
	async kickPlayerAsync(room, targetProfileId, options = {}) {
		const args = {
			roomId: room.id,
			targetProfileId
		};
		if (options.reason !== void 0) args.reason = options.reason;
		await this.rpcClient.call("H5_ROOM_KICK_PLAYER", args);
	}
	async startRoomGameAsync(room, options = {}) {
		await this.rpcClient.call("H5_ROOM_START_GAME", {
			roomId: room.id,
			options: {
				gameConfig: options.gameConfig ?? {},
				turnOrder: options.turnOrder ?? null
			}
		});
	}
	async proposeMoveAsync(room, proposalPayload) {
		const args = {
			roomId: room.id,
			gameSpecificState: proposalPayload.gameSpecificState,
			moveType: proposalPayload.moveType
		};
		if (proposalPayload.clientContext !== void 0) args.clientContext = proposalPayload.clientContext;
		if (proposalPayload.clientProposalId !== void 0) args.clientProposalId = proposalPayload.clientProposalId;
		return await this.rpcClient.call("h5:room:proposeMove", args);
	}
	async validateMoveAsync(_room, moveId, verdict) {
		return {
			success: true,
			moveId,
			isValid: verdict.isValid,
			reason: verdict.reason
		};
	}
	async subscribeAsync(room, options = {}) {
		const roomId = room.id;
		const existingData = this.subscriptions.data[roomId];
		const existingMessages = this.subscriptions.messages[roomId];
		const existingGameEvents = this.subscriptions.gameEvents[roomId];
		const subscribeToData = Boolean(options.onData) && (existingData?.length ?? 0) === 0;
		const subscribeToMessages = Boolean(options.onMessages) && (existingMessages?.length ?? 0) === 0;
		const subscribeToProposedMoves = Boolean(options.onGameEvents) && (existingGameEvents?.length ?? 0) === 0;
		if (subscribeToData || subscribeToMessages || subscribeToProposedMoves) try {
			await this.rpcClient.call("H5_ROOM_SUBSCRIBE", {
				roomId,
				subscribeToData,
				subscribeToMessages,
				subscribeToProposedMoves
			});
		} catch (error) {
			console.error("[RUN] Failed to set up room subscription:", error);
			throw error;
		}
		if (options.onData) {
			if (!this.subscriptions.data[roomId]) this.subscriptions.data[roomId] = [];
			this.subscriptions.data[roomId].push(options.onData);
		}
		if (options.onMessages) {
			if (!this.subscriptions.messages[roomId]) this.subscriptions.messages[roomId] = [];
			this.subscriptions.messages[roomId].push(options.onMessages);
		}
		if (options.onGameEvents) {
			if (!this.subscriptions.gameEvents[roomId]) this.subscriptions.gameEvents[roomId] = [];
			this.subscriptions.gameEvents[roomId].push(options.onGameEvents);
		}
		let disposed = false;
		return () => {
			if (disposed) return;
			disposed = true;
			if (options.onData) {
				const callbacks = this.subscriptions.data[roomId];
				if (callbacks) {
					const index = callbacks.indexOf(options.onData);
					if (index > -1) callbacks.splice(index, 1);
				}
			}
			if (options.onMessages) {
				const callbacks = this.subscriptions.messages[roomId];
				if (callbacks) {
					const index = callbacks.indexOf(options.onMessages);
					if (index > -1) callbacks.splice(index, 1);
				}
			}
			if (options.onGameEvents) {
				const callbacks = this.subscriptions.gameEvents[roomId];
				if (callbacks) {
					const index = callbacks.indexOf(options.onGameEvents);
					if (index > -1) callbacks.splice(index, 1);
				}
			}
			if (!((this.subscriptions.data[roomId]?.length ?? 0) > 0 || (this.subscriptions.messages[roomId]?.length ?? 0) > 0 || (this.subscriptions.gameEvents[roomId]?.length ?? 0) > 0)) this.rpcClient.notify("H5_ROOM_UNSUBSCRIBE", { roomId });
		};
	}
};
//#endregion
//#region src/storage/RpcStorageApi.ts
const FALLBACK_CHUNK_SIZE = 6;
var RpcStorageApi = class {
	rpcClient;
	methodIds;
	/**
	* Extra body fields merged into every RPC call. Used by shared-scope
	* bindings to carry (targetAppId, namespace) alongside the op-specific
	* arguments. `undefined` for app/owner bindings.
	*/
	extraBodyFields;
	hostSupportsMultiGet = void 0;
	capabilityProbePromise;
	constructor(rpcClient, methodIds, extraBodyFields) {
		this.rpcClient = rpcClient;
		this.methodIds = methodIds;
		this.extraBodyFields = extraBodyFields;
	}
	body(extra) {
		if (!this.extraBodyFields && !extra) return void 0;
		return {
			...this.extraBodyFields ?? {},
			...extra ?? {}
		};
	}
	clear() {
		return this.rpcClient.call(this.methodIds.clear, this.body());
	}
	getItem(key) {
		return this.rpcClient.call(this.methodIds.getItem, this.body({ key }));
	}
	setItem(key, value) {
		return this.rpcClient.call(this.methodIds.setItem, this.body({
			key,
			value
		}));
	}
	key(index) {
		return this.rpcClient.call(this.methodIds.getKey, this.body({ index }));
	}
	length() {
		return this.rpcClient.call(this.methodIds.length, this.body());
	}
	removeItem(key) {
		return this.rpcClient.call(this.methodIds.removeItem, this.body({ key }));
	}
	removeMultipleItems(keys) {
		if (!this.methodIds.removeMultipleItems) throw new Error("Method not implemented");
		return this.rpcClient.call(this.methodIds.removeMultipleItems, this.body({ keys }));
	}
	getAllItems() {
		if (!this.methodIds.getAllItems) throw new Error("Method not implemented");
		return this.rpcClient.call(this.methodIds.getAllItems, this.body());
	}
	getAllData() {
		if (!this.methodIds.getAllData) throw new Error("Method not implemented");
		return this.rpcClient.call(this.methodIds.getAllData, this.body());
	}
	setMultipleItems(items) {
		if (!this.methodIds.setMultipleItems) throw new Error("Method not implemented");
		return this.rpcClient.call(this.methodIds.setMultipleItems, this.body({ items }));
	}
	async compareAndSwap(key, expectedValue, nextValue) {
		if (!this.methodIds.compareAndSwap) throw new Error("Method not implemented");
		return this.rpcClient.call(this.methodIds.compareAndSwap, this.body({
			key,
			expectedValue,
			nextValue
		}));
	}
	async fallbackGetMultipleItems(keys) {
		const uniqueKeys = Array.from(new Set(keys));
		const result = {};
		for (let i = 0; i < uniqueKeys.length; i += FALLBACK_CHUNK_SIZE) {
			const chunk = uniqueKeys.slice(i, i + FALLBACK_CHUNK_SIZE);
			const chunkResults = await Promise.all(chunk.map(async (k) => ({
				key: k,
				val: await this.getItem(k)
			})));
			for (const { key, val } of chunkResults) if (val !== null && val !== void 0) result[key] = val;
		}
		return result;
	}
	async getMultipleItems(keys) {
		if (keys.length === 0) return Promise.resolve({});
		if (!this.methodIds.getMultipleItems) throw new Error("Method not implemented");
		if (this.hostSupportsMultiGet === false) return this.fallbackGetMultipleItems(keys);
		if (this.hostSupportsMultiGet === true) return this.rpcClient.call(this.methodIds.getMultipleItems, this.body({ keys }));
		if (this.capabilityProbePromise) {
			await this.capabilityProbePromise;
			if (this.hostSupportsMultiGet === false) return this.fallbackGetMultipleItems(keys);
			return this.rpcClient.call(this.methodIds.getMultipleItems, this.body({ keys }));
		}
		let resolveProbe;
		let rejectProbe;
		const rawProbe = new Promise((resolve, reject) => {
			resolveProbe = resolve;
			rejectProbe = reject;
		});
		rawProbe.catch(() => {});
		this.capabilityProbePromise = rawProbe;
		try {
			const result = await this.rpcClient.call(this.methodIds.getMultipleItems, this.body({ keys }));
			this.hostSupportsMultiGet = true;
			resolveProbe(true);
			return result;
		} catch (error) {
			if (isUnsupportedMessageError(error)) {
				this.hostSupportsMultiGet = false;
				resolveProbe(false);
				return this.fallbackGetMultipleItems(keys);
			}
			rejectProbe(error);
			throw error;
		} finally {
			this.capabilityProbePromise = void 0;
		}
	}
};
//#endregion
//#region src/storage/DualEmitStorageApi.ts
/**
* SharedStorage handle that fires both the M3 `SHARED_STORAGE_*` family and
* the legacy `GLOBAL_STORAGE_*` family on every operation. Whichever family
* the host registers handlers for wins; the other returns synchronously with
* an "Unsupported message type" error which we suppress.
*
* Scope `(targetAppId, namespace, sourceAppId)` is dropped on the legacy
* wire — the legacy host only knows a flat per-user namespace. Two games
* writing the same raw key on a legacy host will collide; this is a known
* trade-off for the transition window. See the migration plan for details.
*/
var DualEmitStorageApi = class {
	rpcClient;
	sharedIds;
	sharedScope;
	globalIds;
	constructor(rpcClient, sharedIds, sharedScope, globalIds) {
		this.rpcClient = rpcClient;
		this.sharedIds = sharedIds;
		this.sharedScope = sharedScope;
		this.globalIds = globalIds;
	}
	sharedBody(extra) {
		const { targetAppId, namespace } = this.sharedScope;
		const body = {
			namespace,
			...extra ?? {}
		};
		if (targetAppId !== void 0) body.targetAppId = targetAppId;
		return body;
	}
	clear() {
		return dualWrite(this.rpcClient.call(this.sharedIds.clear, this.sharedBody()), this.rpcClient.call(this.globalIds.clear, void 0));
	}
	getItem(key) {
		return dualRead(this.rpcClient.call(this.sharedIds.getItem, this.sharedBody({ key })), this.rpcClient.call(this.globalIds.getItem, { key }));
	}
	setItem(key, value) {
		return dualWrite(this.rpcClient.call(this.sharedIds.setItem, this.sharedBody({
			key,
			value
		})), this.rpcClient.call(this.globalIds.setItem, {
			key,
			value
		}));
	}
	key(index) {
		return dualRead(this.rpcClient.call(this.sharedIds.getKey, this.sharedBody({ index })), this.rpcClient.call(this.globalIds.getKey, { index }));
	}
	length() {
		return dualRead(this.rpcClient.call(this.sharedIds.length, this.sharedBody()), this.rpcClient.call(this.globalIds.length, void 0));
	}
	removeItem(key) {
		return dualWrite(this.rpcClient.call(this.sharedIds.removeItem, this.sharedBody({ key })), this.rpcClient.call(this.globalIds.removeItem, { key }));
	}
	removeMultipleItems(keys) {
		if (!this.sharedIds.removeMultipleItems) throw new Error("Method not implemented");
		return dualWrite(this.rpcClient.call(this.sharedIds.removeMultipleItems, this.sharedBody({ keys })), this.rpcClient.call(this.globalIds.removeMultipleItems, { keys }));
	}
	getAllItems() {
		if (!this.sharedIds.getAllItems) throw new Error("Method not implemented");
		return dualRead(this.rpcClient.call(this.sharedIds.getAllItems, this.sharedBody()), this.rpcClient.call(this.globalIds.getAllItems, void 0).then((dict) => Object.keys(dict ?? {})));
	}
	getAllData() {
		if (!this.sharedIds.getAllData) throw new Error("Method not implemented");
		return dualRead(this.rpcClient.call(this.sharedIds.getAllData, this.sharedBody()), this.rpcClient.call(this.globalIds.getAllItems, void 0));
	}
	setMultipleItems(items) {
		if (!this.sharedIds.setMultipleItems) throw new Error("Method not implemented");
		return dualWrite(this.rpcClient.call(this.sharedIds.setMultipleItems, this.sharedBody({ items })), this.rpcClient.call(this.globalIds.setMultipleItems, { items }));
	}
	compareAndSwap() {
		throw new Error("Method not implemented");
	}
	getMultipleItems() {
		throw new Error("Method not implemented");
	}
};
/**
* The host returns this exact prefix synchronously when a message ID has no
* handler registered. Used to distinguish "this host version doesn't support
* the API" from a real error we should propagate.
*/
const NO_HANDLER_PREFIX = "Unsupported message type:";
function isNoHandlerError(reason) {
	return reason instanceof Error && reason.message.startsWith(NO_HANDLER_PREFIX);
}
/**
* Fire both write paths. Succeed if at least one fulfills. If both reject,
* surface a real error before falling back to a no-handler error so callers
* see meaningful failures (quota, network) rather than the suppressed
* legacy-routing signal.
*/
async function dualWrite(primary, fallback) {
	const results = await Promise.allSettled([primary, fallback]);
	if (results.some((r) => r.status === "fulfilled")) return;
	const realError = results.find((r) => r.status === "rejected" && !isNoHandlerError(r.reason));
	if (realError) throw realError.reason;
	throw results[0].reason;
}
/**
* Fire both read paths. Return whichever fulfills first; if both reject,
* surface a real error before a no-handler error.
*/
async function dualRead(primary, fallback) {
	const results = await Promise.allSettled([primary, fallback]);
	for (const r of results) if (r.status === "fulfilled") return r.value;
	for (const r of results) if (r.status === "rejected" && !isNoHandlerError(r.reason)) throw r.reason;
	throw results[0].reason;
}
//#endregion
//#region src/storage/RpcInboundStorageApi.ts
var RpcInboundStorageApi = class {
	rpcClient;
	methodIds;
	scope;
	constructor(rpcClient, methodIds, scope) {
		this.rpcClient = rpcClient;
		this.methodIds = methodIds;
		this.scope = scope;
	}
	body(extra) {
		const { targetAppId, namespace } = this.scope;
		const out = {
			namespace,
			...extra ?? {}
		};
		if (targetAppId !== void 0) out.targetAppId = targetAppId;
		return out;
	}
	async listSources() {
		return this.rpcClient.call(this.methodIds.listSources, this.body());
	}
	async getAllFromSource(sourceAppId) {
		return this.rpcClient.call(this.methodIds.getAllFromSource, this.body({ sourceAppId }));
	}
	async get(sourceAppId, key) {
		return this.rpcClient.call(this.methodIds.get, this.body({
			sourceAppId,
			key
		}));
	}
	async getAllForKey(key) {
		return this.rpcClient.call(this.methodIds.getAllForKey, this.body({ key }));
	}
};
//#endregion
//#region src/storage/index.ts
function initializeStorage(rundotGameApiInstance, host) {
	rundotGameApiInstance.deviceCache = host.deviceCache;
	rundotGameApiInstance.appStorage = host.appStorage;
	rundotGameApiInstance.ownerStorage = host.ownerStorage;
	rundotGameApiInstance.sharedStorage = host.sharedStorage;
}
//#endregion
//#region src/simulation/RpcSimulationApi.ts
var RpcSimulationApi = class {
	rpcClient;
	_simulationConfig = null;
	subscriptionCallbacks = /* @__PURE__ */ new Map();
	constructor(rpcClient) {
		this.rpcClient = rpcClient;
		this.rpcClient.onNotification("H5_SIMULATION_UPDATE", this.handleSimulationUpdate.bind(this));
	}
	isEnabled() {
		return true;
	}
	async validateSlotAssignmentAsync(containerId, slotId, itemId) {
		return this.rpcClient.call("H5_SIMULATION_VALIDATE_ASSIGNMENT", {
			containerId,
			slotId,
			itemId
		});
	}
	async subscribeAsync(options) {
		this.ensureValidSubscribeOptions(options);
		const subscriptionId = generateId();
		this.subscriptionCallbacks.set(subscriptionId, options.onUpdate);
		try {
			await this.rpcClient.call("H5_SIMULATION_SUBSCRIBE", {
				subscriptionId,
				entities: options.entities,
				tags: options.tags,
				activeRuns: options.activeRuns,
				roomId: options.roomId
			});
		} catch (error) {
			this.subscriptionCallbacks.delete(subscriptionId);
			throw error;
		}
		let unsubscribed = false;
		return () => {
			if (unsubscribed) return;
			unsubscribed = true;
			this.subscriptionCallbacks.delete(subscriptionId);
			this.rpcClient.notify("H5_SIMULATION_UNSUBSCRIBE", { subscriptionId });
		};
	}
	executeBatchOperationsAsync(operations, validateOnly) {
		return this.rpcClient.call("H5_SIMULATION_BATCH_OPERATIONS", {
			operations,
			validateOnly
		});
	}
	async getAvailableItemsAsync(containerId, slotId) {
		return (await this.rpcClient.call("H5_SIMULATION_GET_AVAILABLE_ITEMS", {
			containerId,
			slotId
		})).availableItems || [];
	}
	calculatePowerPreviewAsync(containerId, slotId, candidateItemId) {
		return this.rpcClient.call("H5_SIMULATION_CALCULATE_POWER_PREVIEW", {
			containerId,
			slotId,
			candidateItemId
		});
	}
	assignItemToSlotAsync(containerId, slotId, itemId) {
		return this.rpcClient.call("H5_SIMULATION_ASSIGN_ITEM", {
			containerId,
			slotId,
			itemId
		});
	}
	removeItemFromSlotAsync(containerId, slotId) {
		return this.rpcClient.call("H5_SIMULATION_REMOVE_ITEM", {
			containerId,
			slotId
		});
	}
	async getSlotContainersAsync() {
		return (await this.rpcClient.call("H5_SIMULATION_GET_CONTAINERS", {})).containers || [];
	}
	async getSlotAssignmentsAsync(containerId) {
		const response = await this.rpcClient.call("H5_SIMULATION_GET_ASSIGNMENTS", { containerId });
		return Array.isArray(response) ? response : response.assignments || [];
	}
	async getStateAsync(roomId) {
		const response = await this.rpcClient.call("H5_SIMULATION_GET_STATE", { roomId });
		if (response.configuration) this._simulationConfig = response.configuration;
		return response;
	}
	async getConfigAsync(roomId) {
		if (this._simulationConfig) return this._simulationConfig;
		const config = await this.rpcClient.call("H5_SIMULATION_GET_CONFIG", { roomId });
		if (config) {
			this._simulationConfig = config;
			return config;
		}
		throw new Error("No simulation configuration available");
	}
	executeRecipeAsync(recipeId, inputs, options) {
		return this.rpcClient.call("H5_SIMULATION_EXECUTE_RECIPE", {
			recipeId,
			inputs,
			roomId: options?.roomId,
			batchAmount: options?.batchAmount,
			allowPartialBatch: options?.allowPartialBatch,
			entity: options?.entity,
			nonce: options?.nonce
		});
	}
	collectRecipeAsync(runId) {
		return this.rpcClient.call("H5_SIMULATION_COLLECT_RECIPE", { runId });
	}
	resetStateAsync(options) {
		return this.rpcClient.call("H5_SIMULATION_RESET_STATE", { initializeRecipe: options?.initializeRecipe });
	}
	getActiveRunsAsync(options) {
		return this.rpcClient.call("H5_SIMULATION_GET_ACTIVE_RUNS", { roomId: options?.roomId });
	}
	executeScopedRecipeAsync(recipeId, entity, inputs, options) {
		return this.rpcClient.call("H5_SIMULATION_EXECUTE_SCOPED_RECIPE", {
			recipeId,
			entity,
			inputs,
			roomId: options?.roomId ?? null,
			options
		});
	}
	getAvailableRecipesAsync(options) {
		return this.rpcClient.call("H5_SIMULATION_GET_AVAILABLE_RECIPES", {
			roomId: options?.roomId || null,
			includeActorRecipes: options?.includeActorRecipes || false
		});
	}
	getRecipeRequirementsAsync(recipe) {
		return this.rpcClient.call("H5_SIMULATION_GET_RECIPE_REQUIREMENTS", {
			recipeId: recipe.recipeId,
			nonce: recipe.nonce,
			entity: recipe.entity,
			batchAmount: recipe.batchAmount
		});
	}
	getBatchRecipeRequirementsAsync(recipes) {
		return this.rpcClient.call("H5_SIMULATION_GET_BATCH_RECIPE_REQUIREMENTS", { recipes });
	}
	triggerRecipeChainAsync(recipeId, options) {
		return this.rpcClient.call("H5_SIMULATION_TRIGGER_RECIPE_CHAIN", {
			triggerRecipeId: recipeId,
			context: options?.context,
			roomId: options?.roomId
		});
	}
	getEntityMetadataAsync(entityId) {
		return this.rpcClient.call("H5_SIMULATION_GET_ENTITY_METADATA", { entityId });
	}
	async resolveFieldValueAsync(entityId, fieldPath, entity) {
		return (await this.rpcClient.call("H5_SIMULATION_RESOLVE_VALUE", {
			entityId,
			fieldPath,
			entity
		})).value;
	}
	handleSimulationUpdate(notification) {
		if (!notification || !notification.subscriptionId) {
			console.warn("[RUN] Received malformed simulation update");
			return;
		}
		const callback = this.subscriptionCallbacks.get(notification.subscriptionId);
		if (!callback) {
			console.warn("[RUN] Received update for unknown subscription:", notification.subscriptionId);
			return;
		}
		try {
			callback(notification.updates);
		} catch (error) {
			console.error("[RUN] Error in simulation subscription callback", error);
		}
	}
	ensureValidSubscribeOptions(options) {
		if (typeof options !== "object" || options === null) throw new Error("Simulation subscribe requires an options object");
		const opts = options;
		if (typeof opts.onUpdate !== "function") throw new Error("Simulation subscribe requires an onUpdate callback");
		if (!(Array.isArray(opts.entities) && opts.entities.length > 0 || Array.isArray(opts.tags) && opts.tags.length > 0 || Boolean(opts.activeRuns))) throw new Error("Simulation subscribe requires at least one filter (entities, tags, activeRuns)");
	}
};
//#endregion
//#region src/simulation/index.ts
function initializeSimulation(rundotGameApi, host) {
	rundotGameApi.simulation = { isEnabled: () => true };
	rundotGameApi.simulation.getConfigAsync = () => {
		return host.simulation.getConfigAsync();
	};
	rundotGameApi.simulation.getStateAsync = (roomId) => {
		return host.simulation.getStateAsync(roomId);
	};
	rundotGameApi.simulation.executeRecipeAsync = (recipeId, inputs, options) => {
		return host.simulation.executeRecipeAsync(recipeId, inputs, options);
	};
	rundotGameApi.simulation.getActiveRunsAsync = () => {
		return host.simulation.getActiveRunsAsync();
	};
	rundotGameApi.simulation.collectRecipeAsync = (runId) => {
		return host.simulation.collectRecipeAsync(runId);
	};
	rundotGameApi.simulation.executeScopedRecipeAsync = (recipeId, entity, inputs, options) => {
		return host.simulation.executeScopedRecipeAsync(recipeId, entity, inputs, options);
	};
	rundotGameApi.simulation.triggerRecipeChainAsync = (recipeId, options) => {
		return host.simulation.triggerRecipeChainAsync(recipeId, options);
	};
	rundotGameApi.simulation.getAvailableRecipesAsync = async (options) => {
		return host.simulation.getAvailableRecipesAsync(options);
	};
	rundotGameApi.simulation.getRecipeRequirementsAsync = (recipe) => {
		return host.simulation.getRecipeRequirementsAsync(recipe);
	};
	rundotGameApi.simulation.getBatchRecipeRequirementsAsync = (recipes) => {
		return host.simulation.getBatchRecipeRequirementsAsync(recipes);
	};
	rundotGameApi.simulation.resolveFieldValueAsync = (entityId, fieldPath, entity) => {
		return host.simulation.resolveFieldValueAsync(entityId, fieldPath, entity);
	};
	rundotGameApi.simulation.getEntityMetadataAsync = (entityId) => {
		return host.simulation.getEntityMetadataAsync(entityId);
	};
	rundotGameApi.simulation.getSlotAssignmentsAsync = (containerId) => {
		return host.simulation.getSlotAssignmentsAsync(containerId);
	};
	rundotGameApi.simulation.getSlotContainersAsync = () => {
		return host.simulation.getSlotContainersAsync();
	};
	rundotGameApi.simulation.assignItemToSlotAsync = (containerId, slotId, itemId) => {
		return host.simulation.assignItemToSlotAsync(containerId, slotId, itemId);
	};
	rundotGameApi.simulation.removeItemFromSlotAsync = (containerId, slotId) => {
		return host.simulation.removeItemFromSlotAsync(containerId, slotId);
	};
	rundotGameApi.simulation.getAvailableItemsAsync = (containerId, slotId) => {
		return host.simulation.getAvailableItemsAsync(containerId, slotId);
	};
	rundotGameApi.simulation.calculatePowerPreviewAsync = (containerId, slotId, candidateItemId) => {
		return host.simulation.calculatePowerPreviewAsync(containerId, slotId, candidateItemId);
	};
	rundotGameApi.simulation.executeBatchOperationsAsync = (operations, validateOnly) => {
		return host.simulation.executeBatchOperationsAsync(operations, validateOnly);
	};
	rundotGameApi.simulation.validateSlotAssignmentAsync = (containerId, slotId, itemId) => {
		return host.simulation.validateSlotAssignmentAsync(containerId, slotId, itemId);
	};
	rundotGameApi.simulation.subscribeAsync = (options) => {
		return host.simulation.subscribeAsync(options);
	};
	rundotGameApi.simulation.resetStateAsync = (options) => {
		return host.simulation.resetStateAsync(options);
	};
}
//#endregion
//#region src/time/HostTimeApi.ts
var HostTimeApi = class {
	rpcClient;
	rundotGameApi;
	constructor(rpcClient, rundotGameApi) {
		this.rpcClient = rpcClient;
		this.rundotGameApi = rundotGameApi;
	}
	async requestTimeAsync() {
		return await this.rpcClient.call("H5_REQUEST_SERVER_TIME", {});
	}
	formatTime(timestamp, options) {
		const locale = this.rundotGameApi.getLocale();
		const date = new Date(timestamp);
		const dateTimeOptions = {
			dateStyle: options.dateStyle || "medium",
			timeStyle: options.timeStyle || "medium",
			hour12: options.hour12 !== void 0 ? options.hour12 : true,
			...options
		};
		return date.toLocaleString(locale, dateTimeOptions);
	}
	formatNumber(value, options) {
		try {
			const locale = this.rundotGameApi.getLocale();
			const numberOptions = {
				style: options?.style || "decimal",
				minimumFractionDigits: options?.minimumFractionDigits || 0,
				maximumFractionDigits: options?.maximumFractionDigits || 2,
				...options
			};
			return value.toLocaleString(locale, numberOptions);
		} catch (error) {
			console.error("[RUN] Error formatting number:", error);
			return String(value);
		}
	}
	async getFutureTimeAsync(options) {
		const timeInfo = await this.requestTimeAsync();
		const serverTime = new Date(timeInfo.serverTime);
		const result = new Date(serverTime);
		if (options?.days) result.setDate(result.getDate() + options.days);
		if (options?.hours) result.setHours(result.getHours() + options.hours);
		if (options?.minutes) result.setMinutes(result.getMinutes() + options.minutes);
		if (options?.timeOfDay) {
			const { hour = 0, minute = 0, second = 0 } = options.timeOfDay;
			timeInfo.timezoneOffset || (/* @__PURE__ */ new Date()).getTimezoneOffset();
			const localHour = hour;
			result.setHours(localHour, minute, second, 0);
		}
		if (options?.timezone) switch (options.timezone.toUpperCase()) {
			case "PT":
			case "PST":
			case "PDT": {
				const ptOffset = isPacificDaylightTime(result) ? -7 : -8;
				result.setUTCHours(0, 0, 0, 0);
				const { hour = 0, minute = 0, second = 0 } = options.timeOfDay || {};
				const utcHour = (hour - ptOffset) % 24;
				result.setUTCHours(utcHour, minute, second, 0);
				break;
			}
			default: console.warn("[RUN] Timezone " + options.timezone + " not supported, using local time");
		}
		return result.getTime();
	}
};
//#endregion
//#region src/time/index.ts
function initializeTime(rundotGameApi, host) {
	rundotGameApi.requestTimeAsync = () => {
		return host.time.requestTimeAsync();
	};
	rundotGameApi.getFutureTimeAsync = (options) => {
		return host.time.getFutureTimeAsync(options);
	};
	rundotGameApi.formatTime = (timestamp, options) => {
		return host.time.formatTime(timestamp, options);
	};
	rundotGameApi.formatNumber = (value, options) => {
		return host.time.formatNumber(value, options);
	};
}
//#endregion
//#region src/leaderboard/RpcLeaderboardApi.ts
var RpcLeaderboardApi = class {
	rpcClient;
	/** Cache of score tokens for automatic hash computation */
	tokenCache = /* @__PURE__ */ new Map();
	constructor(rpcClient) {
		this.rpcClient = rpcClient;
	}
	/**
	* Create a score token for submitting a score.
	* Token is cached for automatic hash computation if score sealing is enabled.
	*
	* @param mode - Optional game mode
	* @returns Score token with sealing data if enabled
	*/
	async createScoreToken(mode) {
		const token = await this.rpcClient.call("H5_LEADERBOARD_CREATE_SCORE_TOKEN", mode ? { mode } : {});
		this.tokenCache.set(token.token, token);
		return token;
	}
	/**
	* Submit a score to the leaderboard.
	* Automatically computes hash if score sealing is enabled and token was created via createScoreToken().
	*
	* @param params - Score submission parameters
	* @returns Submission result with acceptance status and rank
	* @throws Error if token not found in cache
	*/
	async submitScore(params) {
		if (params.replay !== void 0) assertReplayWithinInlineCap(params.replay);
		let hash;
		if (params.token) {
			const cachedToken = this.tokenCache.get(params.token);
			if (!cachedToken) throw new Error("Invalid token: not found in cache. Did you call createScoreToken() first?");
			if (cachedToken.sealingNonce && cachedToken.sealingSecret) hash = await computeScoreHash(params.score, params.duration, params.token, cachedToken.sealingNonce, cachedToken.sealingSecret);
			this.tokenCache.delete(params.token);
		}
		try {
			return await this.rpcClient.call("H5_LEADERBOARD_SUBMIT_SCORE", {
				token: params.token,
				score: params.score,
				duration: params.duration,
				mode: params.mode,
				period: params.period,
				telemetry: params.telemetry,
				metadata: params.metadata,
				hash,
				replay: params.replay
			});
		} catch (error) {
			const mapped = mapSubmitScoreFailure(error);
			if (mapped) return mapped;
			throw error;
		}
	}
	getPagedScores(options) {
		return this.rpcClient.call("H5_LEADERBOARD_GET_PAGED_SCORES", options ?? {});
	}
	getMyRank(options) {
		return this.rpcClient.call("H5_LEADERBOARD_GET_MY_RANK", options ?? {});
	}
	getPodiumScores(options) {
		return this.rpcClient.call("H5_LEADERBOARD_GET_PODIUM_SCORES", options ?? {});
	}
};
//#endregion
//#region src/leaderboard/validateSubmitScore.ts
const MIN_SCORE = 0;
const MAX_SCORE = 999999999;
const MIN_DURATION_SEC = 10;
const MAX_DURATION_SEC = 3600;
const MAX_METADATA_BYTES = 20480;
function validateSubmitScore(params) {
	const { score, duration, metadata } = params;
	if (typeof score !== "number" || Number.isNaN(score)) throw new RundotApiError("INVALID_ARGUMENT", "Score must be a valid number", 400);
	if (score < MIN_SCORE || score > MAX_SCORE) throw new RundotApiError("INVALID_ARGUMENT", "Score out of bounds", 400);
	if (!Number.isFinite(duration) || duration < 0) throw new RundotApiError("INVALID_ARGUMENT", "Duration must be a positive number", 400);
	if (duration < MIN_DURATION_SEC || duration > MAX_DURATION_SEC) throw new RundotApiError("INVALID_ARGUMENT", "Duration out of bounds", 400);
	if (metadata !== void 0 && metadata !== null) {
		if (typeof metadata !== "object" || Array.isArray(metadata)) throw new RundotApiError("INVALID_ARGUMENT", "Metadata must be a plain object", 400);
		let serialized;
		try {
			serialized = JSON.stringify(metadata);
		} catch {
			throw new RundotApiError("INVALID_ARGUMENT", "Metadata must be JSON serializable", 400);
		}
		if (utf8ByteLength(serialized) > MAX_METADATA_BYTES) throw new RundotApiError("INVALID_ARGUMENT", "Metadata exceeds 20KB limit", 400);
		const reparsed = JSON.parse(serialized);
		if (typeof reparsed !== "object" || reparsed === null || Array.isArray(reparsed)) throw new RundotApiError("INVALID_ARGUMENT", "Metadata must be an object", 400);
	}
}
//#endregion
//#region src/leaderboard/MockLeaderboardApi.ts
var MockLeaderboardApi = class {
	tokens = /* @__PURE__ */ new Map();
	/** Cache of score tokens for automatic hash computation */
	tokenCache = /* @__PURE__ */ new Map();
	entriesByMode = /* @__PURE__ */ new Map();
	tokenCounter = 0;
	enableScoreSealing = false;
	scoreSealingSecret = "mock-leaderboard-secret-key";
	constructor(options) {
		if (options?.enableScoreSealing) this.enableScoreSealing = true;
		if (options?.scoreSealingSecret) this.scoreSealingSecret = options.scoreSealingSecret;
	}
	/**
	* Configure mock leaderboard settings
	*
	* @param options - Configuration options
	*/
	configure(options) {
		if (typeof options.enableScoreSealing === "boolean") this.enableScoreSealing = options.enableScoreSealing;
		if (options.scoreSealingSecret) this.scoreSealingSecret = options.scoreSealingSecret;
	}
	generateNonce() {
		return (Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2)).slice(0, 64);
	}
	getModeKey(mode) {
		return `${mode || "default"}`;
	}
	getEntriesForMode(mode) {
		const key = this.getModeKey(mode);
		if (!this.entriesByMode.has(key)) this.entriesByMode.set(key, []);
		return this.entriesByMode.get(key);
	}
	/**
	* Create a mock score token for testing.
	* Token is cached for automatic hash computation if score sealing is enabled.
	*
	* @param mode - Optional game mode
	* @returns Score token with sealing data if enabled
	*/
	async createScoreToken(mode) {
		const token = `mock_token_${++this.tokenCounter}`;
		const startTime = Date.now();
		const expiresAt = startTime + 36e5;
		const resolvedMode = mode || "default";
		const sealingNonce = this.enableScoreSealing ? this.generateNonce() : null;
		const sealingSecret = this.enableScoreSealing ? this.scoreSealingSecret : null;
		this.tokens.set(token, {
			id: token,
			expiresAt,
			mode: resolvedMode,
			sealingNonce,
			used: false
		});
		const result = {
			token,
			startTime,
			expiresAt,
			sealingNonce,
			sealingSecret,
			mode: resolvedMode
		};
		this.tokenCache.set(token, result);
		return result;
	}
	/**
	* Submit a mock score to the leaderboard.
	* Automatically computes hash if score sealing is enabled and token was created via createScoreToken().
	*
	* @param params - Score submission parameters
	* @returns Submission result with acceptance status and rank
	* @throws Error if token not found in cache or validation fails
	*/
	async submitScore(params) {
		validateSubmitScore(params);
		let hash;
		if (params.token) {
			const cachedToken = this.tokenCache.get(params.token);
			if (!cachedToken) throw new Error("Invalid token: not found in cache. Did you call createScoreToken() first?");
			if (cachedToken.sealingNonce && cachedToken.sealingSecret) hash = await computeScoreHash(params.score, params.duration, params.token, cachedToken.sealingNonce, cachedToken.sealingSecret);
		}
		if (!params.token) {
			const mode = params.mode || "default";
			const submittedAt = Date.now();
			const entry = {
				profileId: `mock_profile`,
				username: "Mock Player",
				avatarUrl: null,
				score: params.score,
				duration: params.duration,
				submittedAt,
				token: "simple-mode",
				rank: null,
				zScore: null,
				isAnomaly: false,
				trustScore: 50,
				metadata: params.metadata ?? null,
				isSeed: false
			};
			const modeEntries = this.getEntriesForMode(mode);
			const existingIndex = modeEntries.findIndex((e) => e.profileId === entry.profileId);
			if (existingIndex !== -1) {
				const existingScore = modeEntries[existingIndex].score;
				if (params.score <= existingScore) return {
					accepted: false,
					rank: null
				};
				modeEntries.splice(existingIndex, 1);
			}
			modeEntries.push(entry);
			modeEntries.sort((a, b) => {
				if (b.score !== a.score) return b.score - a.score;
				return a.submittedAt - b.submittedAt;
			});
			modeEntries.forEach((e, index) => {
				modeEntries[index] = {
					...e,
					rank: index + 1
				};
			});
			return {
				accepted: true,
				rank: modeEntries.find((e) => e.submittedAt === submittedAt)?.rank ?? null
			};
		}
		const scoreToken = this.tokens.get(params.token);
		if (!scoreToken) throw new Error("Invalid score token");
		if (scoreToken.expiresAt < Date.now()) throw new Error("Invalid or expired score token");
		if (scoreToken.used) throw new Error("Score token already used");
		if (params.mode && params.mode !== scoreToken.mode) throw new Error("Submission mode does not match token mode");
		if (scoreToken.sealingNonce && !hash) throw new Error("Score hash required when score sealing is enabled");
		const submittedAt = Date.now();
		const entry = {
			profileId: `mock_profile`,
			username: "Mock Player",
			avatarUrl: null,
			score: params.score,
			duration: params.duration,
			submittedAt,
			token: params.token,
			rank: null,
			zScore: null,
			isAnomaly: false,
			trustScore: 50,
			metadata: params.metadata ?? null,
			isSeed: false
		};
		const modeEntries = this.getEntriesForMode(scoreToken.mode);
		const existingIndex = modeEntries.findIndex((e) => e.profileId === entry.profileId);
		let scoreAccepted = true;
		if (existingIndex !== -1) {
			const existingScore = modeEntries[existingIndex].score;
			if (params.score <= existingScore) scoreAccepted = false;
			else modeEntries.splice(existingIndex, 1);
		}
		if (scoreAccepted) {
			modeEntries.push(entry);
			modeEntries.sort((a, b) => {
				if (b.score !== a.score) return b.score - a.score;
				return a.submittedAt - b.submittedAt;
			});
			modeEntries.forEach((e, index) => {
				modeEntries[index] = {
					...e,
					rank: index + 1
				};
			});
		}
		scoreToken.used = true;
		scoreToken.sealingNonce = null;
		this.tokenCache.delete(params.token);
		const inserted = scoreAccepted ? modeEntries.find((e) => e.token === params.token && e.submittedAt === submittedAt) : null;
		return {
			accepted: scoreAccepted,
			rank: inserted?.rank ?? null
		};
	}
	async getPagedScores(options) {
		const limit = options?.limit ?? 10;
		const mode = options?.mode ?? "default";
		const modeEntries = [...this.getEntriesForMode(mode)];
		return {
			variant: "standard",
			entries: modeEntries.slice(0, limit).map((entry) => ({ ...entry })),
			totalEntries: modeEntries.length,
			nextCursor: null,
			playerRank: null,
			periodInstance: options?.period ?? "alltime"
		};
	}
	async getMyRank(_options) {
		const mode = _options?.mode ?? "default";
		const modeEntries = this.getEntriesForMode(mode);
		const playerEntry = modeEntries[0] ?? null;
		return {
			rank: playerEntry?.rank ?? null,
			score: playerEntry?.score,
			totalPlayers: modeEntries.length,
			percentile: playerEntry ? Math.max(0, 1 - ((playerEntry.rank ?? 1) - 1) / Math.max(modeEntries.length, 1)) : void 0,
			trustScore: 50,
			periodInstance: _options?.period ?? "alltime"
		};
	}
	async getPodiumScores(options) {
		const mode = options?.mode ?? "default";
		const modeEntries = [...this.getEntriesForMode(mode)];
		const topCount = Math.max(1, Math.min(options?.topCount ?? 3, 10));
		const aheadCount = Math.max(0, Math.min(options?.contextAhead ?? 4, 10));
		const behindCount = Math.max(0, Math.min(options?.contextBehind ?? 2, 10));
		const topEntries = modeEntries.slice(0, topCount);
		const playerEntry = modeEntries[0] ?? null;
		const totalEntries = modeEntries.length;
		let playerRank = playerEntry?.rank ?? null;
		let beforePlayer = [];
		let afterPlayer = [];
		let totalBefore = playerRank ? playerRank - 1 : 0;
		let totalAfter = playerRank ? Math.max(totalEntries - playerRank, 0) : 0;
		let omittedBefore = totalBefore;
		let omittedAfter = totalAfter;
		if (playerRank && playerRank > 0) {
			const beforeStart = Math.max(playerRank - aheadCount - 1, 0);
			beforePlayer = modeEntries.slice(beforeStart, playerRank - 1);
			const afterEnd = Math.min(playerRank + behindCount, totalEntries);
			afterPlayer = modeEntries.slice(playerRank, afterEnd);
			const shownTopAhead = topEntries.filter((entry) => (entry.rank ?? 0) > 0 && (entry.rank ?? 0) < playerRank).length;
			omittedBefore = Math.max(totalBefore - (beforePlayer.length + shownTopAhead), 0);
			omittedAfter = Math.max(totalAfter - afterPlayer.length, 0);
		}
		return {
			variant: "highlight",
			entries: topEntries,
			totalEntries,
			nextCursor: null,
			playerRank: playerRank ?? null,
			periodInstance: options?.period ?? "alltime",
			context: {
				topEntries,
				beforePlayer,
				playerEntry: playerEntry ?? null,
				afterPlayer,
				totalBefore,
				totalAfter,
				omittedBefore,
				omittedAfter
			}
		};
	}
};
//#endregion
//#region src/leaderboard/index.ts
function initializeLeaderboard(rundotGameApiInstance, host) {
	rundotGameApiInstance.leaderboard = host.leaderboard;
}
//#endregion
//#region src/entitlements/RpcEntitlementApi.ts
var RpcEntitlementApi = class {
	rpcClient;
	constructor(rpcClient) {
		this.rpcClient = rpcClient;
	}
	async listEntitlements(options) {
		return (await this.rpcClient.call("H5_ENTITLEMENT_LIST", { scope: options?.scope })).entitlements;
	}
	async getQuantity(entitlementId, options) {
		return (await this.rpcClient.call("H5_ENTITLEMENT_GET_QUANTITY", {
			entitlementId,
			scope: options?.scope
		})).quantity;
	}
	async consumeEntitlement(entitlementId, quantity, callback, reason, referenceId) {
		referenceId = referenceId ?? generateId();
		const entitlement = (await this.rpcClient.call("H5_ENTITLEMENT_CONSUME", {
			entitlementId,
			quantity,
			referenceId,
			reason
		})).entitlement;
		if (callback) try {
			await callback(entitlement, referenceId);
		} catch (e) {
			console.warn("[RUN] consumeEntitlement callback threw, but consume succeeded", e);
		}
		return entitlement;
	}
	async getLedger(entitlementId, limit, startAfter) {
		return (await this.rpcClient.call("H5_ENTITLEMENT_GET_LEDGER", {
			entitlementId,
			limit,
			startAfter
		})).ledger;
	}
};
//#endregion
//#region src/entitlements/MockEntitlementApi.ts
const TAG$2 = "Mock Entitlements";
var MockEntitlementApi = class {
	entitlements = [
		{
			docId: "mock-ent-1",
			userId: "mock-user",
			gameId: "mock-game",
			ownerUserId: "mock-owner",
			entitlementId: "boost_speed",
			quantity: 5,
			consumable: true,
			status: "active",
			expiresAt: null,
			createdAt: Date.now() - 864e5,
			updatedAt: Date.now() - 864e5,
			revokedAt: null
		},
		{
			docId: "mock-ent-2",
			userId: "mock-user",
			gameId: "mock-game",
			ownerUserId: "mock-owner",
			entitlementId: "sword_legendary",
			quantity: 1,
			consumable: false,
			status: "active",
			expiresAt: null,
			createdAt: Date.now() - 1728e5,
			updatedAt: Date.now() - 1728e5,
			revokedAt: null
		},
		{
			docId: "mock-ent-3",
			userId: "mock-user",
			gameId: "mock-game",
			ownerUserId: "mock-owner",
			entitlementId: "vip_pass",
			quantity: 1,
			consumable: false,
			status: "active",
			expiresAt: Date.now() + 6048e5,
			createdAt: Date.now() - 864e5,
			updatedAt: Date.now() - 864e5,
			revokedAt: null
		}
	];
	ledger = [
		{
			ledgerId: "mock-ledger-1",
			userId: "mock-user",
			gameId: "mock-game",
			entitlementId: "boost_speed",
			change: 5,
			action: "grant",
			source: "admin",
			referenceId: "mock-ref-1",
			reason: "Initial grant",
			createdAt: Date.now() - 864e5,
			balanceAfter: 5
		},
		{
			ledgerId: "mock-ledger-2",
			userId: "mock-user",
			gameId: "mock-game",
			entitlementId: "sword_legendary",
			change: 1,
			action: "grant",
			source: "purchase",
			referenceId: "mock-ref-2",
			reason: null,
			createdAt: Date.now() - 1728e5,
			balanceAfter: 1
		},
		{
			ledgerId: "mock-ledger-3",
			userId: "mock-user",
			gameId: "mock-game",
			entitlementId: "vip_pass",
			change: 1,
			action: "grant",
			source: "purchase",
			referenceId: "mock-ref-3",
			reason: null,
			createdAt: Date.now() - 864e5,
			balanceAfter: 1
		}
	];
	async listEntitlements(options) {
		const targetGameId = typeof options?.scope === "object" && options.scope && "gameId" in options.scope ? options.scope.gameId : void 0;
		return this.entitlements.filter((e) => {
			if (e.status !== "active") return false;
			if (targetGameId) return e.gameId === targetGameId;
			if (options?.scope === "owner") return true;
			return e.gameId === "mock-game";
		});
	}
	async getQuantity(entitlementId, options) {
		return (await this.listEntitlements(options)).filter((e) => e.entitlementId === entitlementId).reduce((acc, curr) => acc + curr.quantity, 0);
	}
	async consumeEntitlement(entitlementId, quantity, callback, reason, referenceId) {
		mockLog(TAG$2, `consumeEntitlement id=${entitlementId} qty=${quantity}`);
		referenceId = referenceId ?? generateId();
		if (!Number.isFinite(quantity) || quantity <= 0 || !Number.isInteger(quantity)) throw new RundotApiError("UNKNOWN", "quantity must be a positive integer", 0);
		const entitlement = this.entitlements.find((e) => e.entitlementId === entitlementId && e.status === "active");
		if (!entitlement) throw new Error(`Entitlement not found: ${entitlementId}`);
		if (!entitlement.consumable) throw new Error(`Entitlement is not consumable: ${entitlementId}`);
		if (entitlement.quantity < quantity) throw new Error(`Insufficient quantity: have ${entitlement.quantity}, need ${quantity}`);
		entitlement.quantity -= quantity;
		entitlement.updatedAt = Date.now();
		this.ledger.push({
			ledgerId: `mock-ledger-${Date.now()}`,
			userId: entitlement.userId,
			gameId: entitlement.gameId,
			entitlementId,
			change: -quantity,
			action: "consume",
			source: "progression",
			referenceId,
			reason: reason ?? null,
			createdAt: Date.now(),
			balanceAfter: entitlement.quantity
		});
		const result = { ...entitlement };
		if (callback) try {
			await callback(result, referenceId);
		} catch (e) {
			console.warn("[RUN:mock] consumeEntitlement callback threw, but consume succeeded", e);
		}
		return result;
	}
	async getLedger(entitlementId, limit, startAfter) {
		let entries = [...this.ledger];
		if (entitlementId) entries = entries.filter((e) => e.entitlementId === entitlementId);
		entries.sort((a, b) => b.createdAt - a.createdAt);
		if (startAfter) entries = entries.filter((e) => e.createdAt < startAfter);
		if (limit) entries = entries.slice(0, limit);
		return entries;
	}
	/** Test helper: seed an entitlement */
	_seedEntitlement(entitlement) {
		const idx = this.entitlements.findIndex((e) => e.docId === entitlement.docId);
		if (idx >= 0) this.entitlements[idx] = entitlement;
		else this.entitlements.push(entitlement);
	}
	/** Test helper: reset state */
	_reset() {
		this.entitlements = [];
		this.ledger = [];
	}
};
//#endregion
//#region src/entitlements/index.ts
function initializeEntitlements(rundotGameApiInstance, host) {
	rundotGameApiInstance.entitlements = host.entitlements;
}
//#endregion
//#region src/stats/RpcStatsApi.ts
/**
* Production StatsApi backed by the SDK's RPC bridge.
*
* Coalescing model: every `submit()` call within a single synchronous tick
* joins the same pending batch. The batch is flushed on the next microtask
* via `Promise.resolve().then(...)` — one RPC per tick. This collapses the
* common case (game loop calling submit several times in a frame) into a
* single round-trip without using timers, which the repo style rules
* disallow for coordination.
*
* Per-stat last-write-wins on value; per-stat demux on response — see the
* StatsApi interface doc for the caller contract.
*
* Read methods (`getValue`, `getAllValues`) are direct RPC calls.
*
* No lifecycle hooks are wired: a microtask drains at every event-loop
* checkpoint, so any pending submit is flushed before the browser reaches
* an unload checkpoint. There is nothing left "pending past tick" to flush.
*/
var RpcStatsApi = class {
	rpcClient;
	pending = /* @__PURE__ */ new Map();
	scheduledFlush = false;
	constructor(rpcClient) {
		this.rpcClient = rpcClient;
	}
	async submit(statId, value) {
		return new Promise((resolve, reject) => {
			const resolver = {
				resolve,
				reject
			};
			const existing = this.pending.get(statId);
			if (existing) {
				existing.value = value;
				existing.resolvers.push(resolver);
			} else this.pending.set(statId, {
				value,
				resolvers: [resolver]
			});
			this.scheduleFlush();
		});
	}
	async getValue(statId) {
		return (await this.rpcClient.call("H5_STATS_GET_VALUE", { statId })).value;
	}
	async getAllValues() {
		return (await this.rpcClient.call("H5_STATS_GET_ALL", {})).stats;
	}
	scheduleFlush() {
		if (this.scheduledFlush) return;
		this.scheduledFlush = true;
		Promise.resolve().then(() => this.flushNow());
	}
	async flushNow() {
		this.scheduledFlush = false;
		if (this.pending.size === 0) return;
		const batchValues = {};
		const resolversByStatId = /* @__PURE__ */ new Map();
		for (const [statId, entry] of this.pending) {
			batchValues[statId] = entry.value;
			resolversByStatId.set(statId, entry.resolvers);
		}
		this.pending = /* @__PURE__ */ new Map();
		try {
			const results = await this.sendBatch(batchValues);
			const resultsByStatId = new Map(results.map((r) => [r.statId, r]));
			for (const [statId, resolvers] of resolversByStatId) {
				const r = resultsByStatId.get(statId);
				if (!r || !r.ok) {
					const err = new Error(r?.error ?? "stat submit failed");
					for (const resolver of resolvers) resolver.reject(err);
				} else for (const resolver of resolvers) resolver.resolve({ grants: r.grants ?? [] });
			}
		} catch (err) {
			for (const [, resolvers] of resolversByStatId) for (const resolver of resolvers) resolver.reject(err);
		}
	}
	async sendBatch(stats) {
		return (await this.rpcClient.call("H5_STATS_SUBMIT_BATCH", { stats })).results ?? [];
	}
};
//#endregion
//#region src/stats/index.ts
function initializeStats(rundotGameApiInstance, host) {
	rundotGameApiInstance.stats = host.stats;
}
//#endregion
//#region src/collectibles/RpcCollectiblesApi.ts
/**
* Production CollectiblesApi backed by the SDK's RPC bridge. Both methods are
* direct RPC calls — no batching. `listCards` is typically called once on
* game init; `claimVipCard` is a single user-initiated action.
*/
var RpcCollectiblesApi = class {
	rpcClient;
	constructor(rpcClient) {
		this.rpcClient = rpcClient;
	}
	async listCards() {
		return (await this.rpcClient.call("H5_COLLECTIBLES_LIST_CARDS", {})).cards ?? [];
	}
	async claimVipCard(seriesId, cardId) {
		const response = await this.rpcClient.call("H5_COLLECTIBLES_VIP_CLAIM", {
			seriesId,
			cardId
		});
		return {
			granted: response.granted,
			cardId: response.cardId
		};
	}
};
//#endregion
//#region src/collectibles/index.ts
function initializeCollectibles(rundotGameApiInstance, host) {
	rundotGameApiInstance.collectibles = host.collectibles;
}
//#endregion
//#region src/shop/RpcShopApi.ts
const INTERACTIVE_PURCHASE_TIMEOUT = -1;
/**
* Host-side code for "the player closed the top-up paywall we opened because
* they were short on currency" (H5ShopHandler). It arrives as a rejection —
* the same channel as a genuine failure — which meant every game that didn't
* inspect `err.code` reported a deliberate dismissal as a hard failure.
*/
const USER_CANCELLED_CODE = "USER_CANCELLED";
function isUserCancelled(error) {
	return error?.code === USER_CANCELLED_CODE;
}
var RpcShopApi = class {
	rpcClient;
	constructor(rpcClient) {
		this.rpcClient = rpcClient;
	}
	async getCatalog(includeInactive, includeExpired, includeUnreleased) {
		return await this.rpcClient.call("H5_SHOP_GET_CATALOG", {
			includeInactive,
			includeExpired,
			includeUnreleased
		});
	}
	async getItemDetail(itemId) {
		return (await this.rpcClient.call("H5_SHOP_GET_ITEM_DETAIL", { itemId })).item;
	}
	async purchase(itemId, idempotencyKey) {
		return this.callPurchase({
			itemId,
			idempotencyKey
		});
	}
	async purchaseCollectionItem(collectionId, itemId, idempotencyKey) {
		return this.callPurchase({
			itemId,
			idempotencyKey,
			collectionId
		});
	}
	/**
	* Turn the host's cancel rejection into a resolved result so a dismissed
	* paywall is a RESULT, not an error. Everything else still rejects, so real
	* failures keep reaching the game's catch block.
	*
	* This lives in the SDK rather than the host on purpose: games bundle their
	* own SDK copy, so already-deployed games keep the old rejection until they
	* rebuild, and the new contract holds against every host version that
	* reports the dismissal with `USER_CANCELLED` — old and new alike.
	*/
	async callPurchase(args) {
		try {
			return await this.rpcClient.call("H5_SHOP_PURCHASE", args, INTERACTIVE_PURCHASE_TIMEOUT);
		} catch (error) {
			if (!isUserCancelled(error)) throw error;
			return {
				success: false,
				cancelled: true,
				order: null
			};
		}
	}
	async getOrder(orderId) {
		return await this.rpcClient.call("H5_SHOP_GET_ORDER_STATUS", { orderId });
	}
	async getOrderHistory(options) {
		return await this.rpcClient.call("H5_SHOP_GET_ORDER_HISTORY", { limit: options?.limit });
	}
	async requestRefund(orderId, reasonCode) {
		return await this.rpcClient.call("H5_SHOP_REQUEST_REFUND", {
			orderId,
			reasonCode
		});
	}
};
//#endregion
//#region src/shop/MockShopApi.ts
const TAG$1 = "Mock Shop";
const VALID_REFUND_REASONS = /* @__PURE__ */ new Set([
	"not_as_expected",
	"accidental_purchase",
	"technical_issue",
	"changed_mind",
	"other"
]);
const MOCK_ITEMS = [{
	itemId: "speed_boost",
	name: "Speed Boost",
	description: "Doubles movement speed for 60 seconds",
	assets: { icon: "speed_icon.png" },
	price: {
		type: "bucks",
		value: "100"
	},
	category: "consumable",
	unique: false,
	active: true,
	regions: [],
	tags: ["boost", "consumable"],
	sortOrder: 1,
	releasedAt: null,
	expiresAt: null,
	entitlements: [{
		entitlementId: "speed_boost_ent",
		quantity: 1,
		consumable: true
	}],
	refundEligible: true,
	refundWindowHours: 24,
	resolvedPrice: {
		originalPrice: {
			type: "bucks",
			value: "100"
		},
		finalPrice: {
			type: "bucks",
			value: "75"
		},
		appliedSales: [{
			saleId: "launch_sale",
			discountType: "percentage",
			discountValue: 25
		}]
	}
}, {
	itemId: "premium_skin",
	name: "Premium Skin",
	description: "Exclusive character skin",
	assets: { thumbnail: "premium_skin.png" },
	price: {
		type: "bucks",
		value: "500"
	},
	category: "non_consumable",
	unique: true,
	active: true,
	regions: [],
	tags: ["cosmetic", "exclusive"],
	sortOrder: 2,
	releasedAt: null,
	expiresAt: null,
	entitlements: [{
		entitlementId: "premium_skin_ent",
		quantity: 1,
		consumable: false
	}],
	refundEligible: false,
	refundWindowHours: 0,
	resolvedPrice: {
		originalPrice: {
			type: "bucks",
			value: "500"
		},
		finalPrice: {
			type: "bucks",
			value: "500"
		},
		appliedSales: []
	}
}];
const MOCK_COLLECTIONS = [{
	collectionId: "episodes",
	price: {
		type: "bucks",
		value: "50"
	},
	entitlement: { consumable: false },
	refundEligible: true,
	refundWindowHours: 24,
	resolvedDefaults: {
		originalPrice: {
			type: "bucks",
			value: "50"
		},
		finalPrice: {
			type: "bucks",
			value: "50"
		},
		appliedSales: []
	},
	items: [{
		itemId: "ep-premium-1",
		resolvedPrice: {
			originalPrice: {
				type: "bucks",
				value: "100"
			},
			finalPrice: {
				type: "bucks",
				value: "100"
			},
			appliedSales: []
		}
	}]
}];
function createMockOrder(itemId, item) {
	const now = (/* @__PURE__ */ new Date()).toISOString();
	const mockItem = item || MOCK_ITEMS[0];
	return {
		orderId: "mock-order-" + Date.now(),
		userId: "mock-user-123",
		gameId: "mock-game-123",
		configId: "mock-config-123",
		itemId,
		itemSnapshot: {
			name: mockItem.name,
			price: mockItem.price,
			entitlements: mockItem.entitlements
		},
		originalPrice: mockItem.resolvedPrice.originalPrice,
		finalPrice: mockItem.resolvedPrice.finalPrice,
		appliedSales: mockItem.resolvedPrice.appliedSales,
		status: "fulfilled",
		statusHistory: [
			{
				status: "created",
				timestamp: now
			},
			{
				status: "pending_payment",
				timestamp: now
			},
			{
				status: "paid",
				timestamp: now
			},
			{
				status: "fulfilled",
				timestamp: now
			}
		],
		refund: null,
		idempotencyKey: "mock-idem-" + Date.now(),
		createdAt: now,
		updatedAt: now
	};
}
var MockShopApi = class {
	async getCatalog(includeInactive, includeExpired, includeUnreleased) {
		const now = Date.now();
		let items = [...MOCK_ITEMS];
		if (!includeInactive) items = items.filter((i) => i.active);
		if (!includeExpired) items = items.filter((i) => i.expiresAt === null || i.expiresAt > now);
		if (!includeUnreleased) items = items.filter((i) => i.releasedAt === null || i.releasedAt <= now);
		return {
			configId: "mock-config-123",
			items,
			collections: MOCK_COLLECTIONS
		};
	}
	async getItemDetail(itemId) {
		const item = MOCK_ITEMS.find((i) => i.itemId === itemId);
		if (!item) throw new Error(`[RUN:mock] Item not found: ${itemId}`);
		return item;
	}
	async purchase(itemId, _idempotencyKey) {
		mockLog(TAG$1, `purchase itemId=${itemId}`);
		const item = MOCK_ITEMS.find((i) => i.itemId === itemId);
		if (!item) throw new RundotApiError("UNKNOWN", "Item not found", 0);
		return {
			success: true,
			order: createMockOrder(itemId, item)
		};
	}
	async purchaseCollectionItem(collectionId, itemId, _idempotencyKey) {
		mockLog(TAG$1, `purchaseCollectionItem collectionId=${collectionId} itemId=${itemId}`);
		const order = createMockOrder(itemId);
		order.collectionId = collectionId;
		return {
			success: true,
			order
		};
	}
	async getOrder(orderId) {
		const order = createMockOrder("speed_boost");
		order.orderId = orderId;
		return {
			success: true,
			order
		};
	}
	async getOrderHistory(_options) {
		return {
			success: true,
			orders: [createMockOrder("speed_boost")]
		};
	}
	async requestRefund(orderId, reasonCode) {
		mockLog(TAG$1, `requestRefund orderId=${orderId} reason=${reasonCode}`);
		if (!VALID_REFUND_REASONS.has(reasonCode)) throw new RundotApiError("UNKNOWN", "Invalid reason code", 0);
		const order = createMockOrder("speed_boost");
		order.orderId = orderId;
		order.status = "refunded";
		order.statusHistory.push({
			status: "refunded",
			timestamp: (/* @__PURE__ */ new Date()).toISOString()
		});
		order.refund = {
			amount: order.finalPrice,
			reasonCode,
			requestedAt: (/* @__PURE__ */ new Date()).toISOString(),
			processedAt: (/* @__PURE__ */ new Date()).toISOString()
		};
		return {
			success: true,
			order
		};
	}
};
//#endregion
//#region src/shop/index.ts
function initializeShop(rundotGameApiInstance, host) {
	rundotGameApiInstance.shop = host.shop;
}
//#endregion
//#region src/game-preloader/RpcPreloaderApi.ts
var RpcPreloaderApi = class {
	rpcClient;
	constructor(rpcClient) {
		this.rpcClient = rpcClient;
	}
	async showLoadScreen() {
		await this.rpcClient.call("H5_SHOW_LOAD_SCREEN");
	}
	async hideLoadScreen() {
		await this.rpcClient.call("H5_HIDE_LOAD_SCREEN");
	}
	async setLoaderText(text) {
		await this.rpcClient.call("H5_SET_LOADER_TEXT", { text });
	}
	async setLoaderProgress(progress) {
		await this.rpcClient.call("H5_SET_LOADER_PROGRESS", { progress });
	}
};
//#endregion
//#region src/game-preloader/index.ts
function initializePreloader(rundotGameApi, host) {
	rundotGameApi.preloader = host.preloader;
}
//#endregion
//#region src/ugc/RpcUgcApi.ts
var RpcUgcApi = class {
	rpcClient;
	constructor(rpcClient) {
		this.rpcClient = rpcClient;
	}
	async create(params) {
		return this.rpcClient.call("H5_UGC_CREATE", params);
	}
	async update(params) {
		return this.rpcClient.call("H5_UGC_UPDATE", params);
	}
	async delete(id) {
		await this.rpcClient.call("H5_UGC_DELETE", { id });
	}
	async get(id) {
		return this.rpcClient.call("H5_UGC_GET", { id });
	}
	async listMine(params) {
		return this.rpcClient.call("H5_UGC_LIST_MINE", params ?? {});
	}
	async browse(params) {
		return this.rpcClient.call("H5_UGC_BROWSE", params ?? {});
	}
	async listShared(params) {
		return this.rpcClient.call("H5_UGC_LIST_SHARED", params ?? {});
	}
	async addCollaborator(params) {
		await this.rpcClient.call("H5_UGC_ADD_MEMBER", params);
	}
	async removeCollaborator(params) {
		await this.rpcClient.call("H5_UGC_REMOVE_MEMBER", params);
	}
	async listCollaborators(entryId) {
		return this.rpcClient.call("H5_UGC_LIST_MEMBERS", { entryId });
	}
	async getMany(params) {
		return this.rpcClient.call("H5_UGC_GET_MANY", params);
	}
	async like(id) {
		return this.rpcClient.call("H5_UGC_LIKE", { id });
	}
	async unlike(id) {
		return this.rpcClient.call("H5_UGC_UNLIKE", { id });
	}
	async recordUse(id) {
		return this.rpcClient.call("H5_UGC_RECORD_USE", { id });
	}
	async report(params) {
		await this.rpcClient.call("H5_UGC_REPORT", params);
	}
	async checkTextAsync(text, options) {
		return checkText(text, options);
	}
	async count(params) {
		return this.rpcClient.call("H5_UGC_COUNT", params ?? {});
	}
	async follow(targetProfileId) {
		await this.rpcClient.call("H5_UGC_FOLLOW", { targetProfileId });
	}
	async unfollow(targetProfileId) {
		await this.rpcClient.call("H5_UGC_UNFOLLOW", { targetProfileId });
	}
	async isFollowing(targetProfileId) {
		return this.rpcClient.call("H5_UGC_IS_FOLLOWING", { targetProfileId });
	}
	async getFollowCounts(targetProfileId) {
		return this.rpcClient.call("H5_UGC_GET_FOLLOW_COUNTS", { targetProfileId });
	}
	async crossAppBrowse(params) {
		return this.rpcClient.call("H5_UGC_CROSS_APP_BROWSE", params);
	}
	async crossAppGet(targetAppId, id) {
		return this.rpcClient.call("H5_UGC_CROSS_APP_GET", {
			targetAppId,
			id
		});
	}
	async crossAppGetMany(targetAppId, params) {
		return this.rpcClient.call("H5_UGC_CROSS_APP_GET_MANY", {
			targetAppId,
			...params
		});
	}
	async crossAppCount(targetAppId, params) {
		return this.rpcClient.call("H5_UGC_CROSS_APP_COUNT", {
			targetAppId,
			...params ?? {}
		});
	}
	async crossAppCreate(params) {
		return this.rpcClient.call("H5_UGC_CROSS_APP_CREATE", params);
	}
	async crossAppUpdate(params) {
		return this.rpcClient.call("H5_UGC_CROSS_APP_UPDATE", params);
	}
	async crossAppDelete(targetAppId, id) {
		await this.rpcClient.call("H5_UGC_CROSS_APP_DELETE", {
			targetAppId,
			id
		});
	}
	async getUserRecommendation(count, filter) {
		return this.rpcClient.call("H5_UGC_GET_USER_RECOMMENDATION", {
			count,
			filter
		});
	}
	async getItemRecommendation(ugcId, count, filter) {
		return this.rpcClient.call("H5_UGC_GET_ITEM_RECOMMENDATION", {
			ugcId,
			count,
			filter
		});
	}
	async getCompositeRecommendation(count, sourceFilter, resultFilter) {
		return this.rpcClient.call("H5_UGC_GET_COMPOSITE_RECOMMENDATION", {
			count,
			sourceFilter,
			resultFilter
		});
	}
	async getMoreRecommendations(origRecommId, count) {
		return this.rpcClient.call("H5_UGC_GET_MORE_RECOMMENDATIONS", {
			origRecommId,
			count
		});
	}
	async addDetailView(ugcId, recommId) {
		await this.rpcClient.call("H5_UGC_ADD_DETAIL_VIEW", {
			ugcId,
			recommId
		});
	}
	async addRating(ugcId, rating, recommId) {
		await this.rpcClient.call("H5_UGC_ADD_RATING", {
			ugcId,
			rating,
			recommId
		});
	}
	async addCartAddition(ugcId, recommId) {
		await this.rpcClient.call("H5_UGC_ADD_CART_ADDITION", {
			ugcId,
			recommId
		});
	}
	async setViewPortion(ugcId, portion, recommId) {
		await this.rpcClient.call("H5_UGC_SET_VIEW_PORTION", {
			ugcId,
			portion,
			recommId
		});
	}
	voting = {
		vote: (params) => {
			return this.rpcClient.call("H5_UGC_VOTING_VOTE", params);
		},
		unvote: (params) => {
			return this.rpcClient.call("H5_UGC_VOTING_UNVOTE", params);
		},
		getMyVotes: () => {
			return this.rpcClient.call("H5_UGC_VOTING_GET_MY_VOTES", {});
		},
		getLeaderboard: (params) => {
			return this.rpcClient.call("H5_UGC_VOTING_GET_LEADERBOARD", params ?? {});
		},
		getWinners: (params) => {
			return this.rpcClient.call("H5_UGC_VOTING_GET_WINNERS", params ?? {});
		}
	};
};
//#endregion
//#region src/ugc/MockUgcApi.ts
var MockUgcApi = class {
	async create(_params) {
		console.warn("[RUN] UGC API not available in mock mode");
		throw new Error("UGC API requires backend connection");
	}
	async update(_params) {
		console.warn("[RUN] UGC API not available in mock mode");
		throw new Error("UGC API requires backend connection");
	}
	async delete(_id) {
		console.warn("[RUN] UGC API not available in mock mode");
		throw new Error("UGC API requires backend connection");
	}
	async get(_id) {
		return null;
	}
	async listMine(_params) {
		return {
			entries: [],
			nextCursor: void 0
		};
	}
	async browse(_params) {
		return {
			entries: [],
			nextCursor: void 0
		};
	}
	async listShared(_params) {
		return {
			entries: [],
			nextCursor: void 0
		};
	}
	async addCollaborator(_params) {
		console.warn("[RUN] UGC API not available in mock mode");
		throw new Error("UGC API requires backend connection");
	}
	async removeCollaborator(_params) {
		console.warn("[RUN] UGC API not available in mock mode");
		throw new Error("UGC API requires backend connection");
	}
	async listCollaborators(_entryId) {
		return {
			authorId: "",
			editorIds: []
		};
	}
	async getMany(_params) {
		return { entries: [] };
	}
	async like(_id) {
		console.warn("[RUN] UGC API not available in mock mode");
		throw new Error("UGC API requires backend connection");
	}
	async unlike(_id) {
		console.warn("[RUN] UGC API not available in mock mode");
		throw new Error("UGC API requires backend connection");
	}
	async recordUse(_id) {
		console.warn("[RUN] UGC API not available in mock mode");
		throw new Error("UGC API requires backend connection");
	}
	async report(_params) {
		console.warn("[RUN] UGC API not available in mock mode");
		throw new Error("UGC API requires backend connection");
	}
	async checkTextAsync(text, options) {
		return checkText(text, options);
	}
	async count(_params) {
		return { count: 0 };
	}
	async follow(_targetProfileId) {
		console.warn("[RUN] UGC API not available in mock mode");
		throw new Error("UGC API requires backend connection");
	}
	async unfollow(_targetProfileId) {
		console.warn("[RUN] UGC API not available in mock mode");
		throw new Error("UGC API requires backend connection");
	}
	async isFollowing(_targetProfileId) {
		return { isFollowing: false };
	}
	async getFollowCounts(_targetProfileId) {
		return {
			followerCount: 0,
			followingCount: 0
		};
	}
	async crossAppBrowse(_params) {
		throw new Error("Cross-app UGC requires a backend connection");
	}
	async crossAppGet(_targetAppId, _id) {
		throw new Error("Cross-app UGC requires a backend connection");
	}
	async crossAppGetMany(_targetAppId, _params) {
		throw new Error("Cross-app UGC requires a backend connection");
	}
	async crossAppCount(_targetAppId, _params) {
		throw new Error("Cross-app UGC requires a backend connection");
	}
	async crossAppCreate(_params) {
		throw new Error("Cross-app UGC requires a backend connection");
	}
	async crossAppUpdate(_params) {
		throw new Error("Cross-app UGC requires a backend connection");
	}
	async crossAppDelete(_targetAppId, _id) {
		throw new Error("Cross-app UGC requires a backend connection");
	}
	async getUserRecommendation(_count, _filter) {
		return {
			recommId: "",
			entries: []
		};
	}
	async getItemRecommendation(_ugcId, _count, _filter) {
		return {
			recommId: "",
			entries: []
		};
	}
	async getCompositeRecommendation(_count, _sourceFilter, _resultFilter) {
		return {
			recommId: "",
			sourceEntry: null,
			entries: []
		};
	}
	async getMoreRecommendations(_origRecommId, _count) {
		return {
			recommId: "",
			entries: []
		};
	}
	async addDetailView(_ugcId, _recommId) {}
	async addRating(_ugcId, _rating, _recommId) {}
	async addCartAddition(_ugcId, _recommId) {}
	async setViewPortion(_ugcId, _portion, _recommId) {}
	voting = {
		vote: async () => {
			console.warn("[RUN] UGC voting not available in mock mode");
			throw new Error("UGC voting requires backend connection");
		},
		unvote: async () => {
			console.warn("[RUN] UGC voting not available in mock mode");
			throw new Error("UGC voting requires backend connection");
		},
		getMyVotes: async () => {
			return {
				weekKey: "mock",
				totals: {
					budget: 0,
					used: 0,
					remaining: 0
				},
				byEntry: []
			};
		},
		getLeaderboard: async () => {
			return {
				weekKey: "mock",
				items: [],
				nextCursor: null
			};
		},
		getWinners: async () => {
			return {
				items: [],
				nextCursor: null
			};
		}
	};
};
//#endregion
//#region src/ugc/index.ts
function initializeUgc(rundotGameApiInstance, host) {
	rundotGameApiInstance.ugc = host.ugc;
}
//#endregion
//#region src/social/MockSocialApi.ts
const MOCK_QR_CODE = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
const MOCK_SHARE_LINK_ID = "mock-share-id";
var MockSocialApi = class {
	async shareLinkAsync(options) {
		validateShareParams(options.shareParams);
		validateShareMetadata(options.metadata);
		validateShareTarget(options.target);
		const shareUrl = this.createMockUrl(options.shareParams);
		if (typeof navigator !== "undefined" && navigator.clipboard) try {
			await navigator.clipboard.writeText(shareUrl);
		} catch (error) {
			console.warn("[RUN:mock] Failed to copy share URL to clipboard", error);
		}
		return {
			shareUrl,
			shareLinkId: MOCK_SHARE_LINK_ID
		};
	}
	async createQRCodeAsync(options) {
		validateShareParams(options.shareParams);
		validateShareMetadata(options.metadata);
		validateShareTarget(options.target);
		return {
			shareUrl: this.createMockUrl(options.shareParams),
			qrCode: MOCK_QR_CODE,
			shareLinkId: MOCK_SHARE_LINK_ID
		};
	}
	async setShareIntentAsync(options) {
		validateShareIntentParams(options.shareParams);
		validateShareMetadata(options.metadata);
		validateShareTarget(options.target);
	}
	async clearShareIntentAsync() {}
	async addShareClickDataAsync(options) {
		validateClickMetadata(options.metadata);
	}
	async getShareClicksAsync(options) {
		return {
			clicks: [],
			truncated: false
		};
	}
	async getMyShareClickDataAsync(options) {
		return null;
	}
	async shareFileAsync(options) {
		validateShareFile(options);
		console.warn("[RUN:mock] shareFileAsync called — returning cancelled: false");
		return { cancelled: false };
	}
	async canShareFileAsync() {
		return { supported: false };
	}
	async composeSocialPostAsync(options) {
		const text = stripComposeControlChars(options.text ?? "");
		const title = options.title === void 0 ? void 0 : stripComposeControlChars(options.title);
		validateComposePost({
			text,
			title,
			subreddit: options.subreddit
		});
		if (options.media) validateShareFile(options.media);
		validateShareParams(options.shareParams);
		validateShareMetadata(options.metadata);
		const link = options.shareParams ? this.createMockUrl(options.shareParams) : void 0;
		if (options.platform === "tiktok" || options.platform === "instagram") {
			console.warn(`[RUN:mock] composeSocialPostAsync: "${options.platform}" is a share-sheet destination with no mock UI — returning completed: false`);
			return { completed: false };
		}
		const destination = options.platform ?? "x";
		const url = destination === "reddit" ? buildRedditComposerUrl({
			text,
			link,
			title,
			subreddit: options.subreddit
		}) : buildXComposerUrl(text, link);
		if (typeof window !== "undefined" && typeof window.open === "function") window.open(url, "_blank", "noopener,noreferrer");
		else console.warn(`[RUN:mock] composeSocialPostAsync composer URL: ${url}`);
		return {
			completed: true,
			destination
		};
	}
	async openXFollowMeLinkAsync() {
		console.warn("[RUN:mock] openXFollowMeLinkAsync called — returning not_configured");
		return {
			completed: false,
			reason: "not_configured"
		};
	}
	async openInstagramFollowMeLinkAsync() {
		console.warn("[RUN:mock] openInstagramFollowMeLinkAsync called — returning not_configured");
		return {
			completed: false,
			reason: "not_configured"
		};
	}
	async openTikTokFollowMeLinkAsync() {
		console.warn("[RUN:mock] openTikTokFollowMeLinkAsync called — returning not_configured");
		return {
			completed: false,
			reason: "not_configured"
		};
	}
	async openDiscordFollowMeLinkAsync() {
		console.warn("[RUN:mock] openDiscordFollowMeLinkAsync called — returning not_configured");
		return {
			completed: false,
			reason: "not_configured"
		};
	}
	async getConfiguredFollowMePlatformsAsync() {
		return [];
	}
	createMockUrl(_shareParams) {
		console.warn("[RUN:mock] Share params are stored online — mock URL is just a template");
		console.warn("[RUN:mock] Actual share URL looks like: https://mock-share-url.com/97dt/mock-share-id");
		return `https://mock-share-url.com/97dt/mock-share-id`;
	}
};
//#endregion
//#region src/audioGen/RpcAudioGenApi.ts
var RpcAudioGenApi = class {
	rpcClient;
	constructor(rpcClient) {
		this.rpcClient = rpcClient;
	}
	async generate(params) {
		return mapCreditsExhaustion(this.rpcClient.call("H5_AUDIO_GEN_GENERATE", params, -1));
	}
	async getCompletedJobs() {
		return this.rpcClient.call("H5_POLL_COMPLETED_JOBS", { type: "audioGen" });
	}
	async listVoices() {
		return this.rpcClient.call("H5_AUDIO_GEN_LIST_VOICES");
	}
	async designVoices(params) {
		return mapCreditsExhaustion(this.rpcClient.call("H5_AUDIO_GEN_DESIGN_VOICES", params, -1));
	}
	async saveDesignedVoice(params) {
		return mapCreditsExhaustion(this.rpcClient.call("H5_AUDIO_GEN_SAVE_DESIGNED_VOICE", params, -1));
	}
};
//#endregion
//#region src/audioGen/MockAudioGenApi.ts
var MockAudioGenApi = class {
	async generate(_params) {
		console.warn("[RUN] Audio generation API not available in mock mode");
		throw new Error("Audio generation API requires backend connection");
	}
	async getCompletedJobs() {
		return [];
	}
	async listVoices() {
		console.warn("[RUN] Voice library API not available in mock mode");
		return { voices: [] };
	}
	async designVoices(_params) {
		console.warn("[RUN] designVoices not available in mock mode");
		throw new Error("Voice design API requires backend connection");
	}
	async saveDesignedVoice(_params) {
		console.warn("[RUN] saveDesignedVoice not available in mock mode");
		throw new Error("Save designed voice API requires backend connection");
	}
};
//#endregion
//#region src/videoGen/RpcVideoGenApi.ts
var RpcVideoGenApi = class {
	rpcClient;
	constructor(rpcClient) {
		this.rpcClient = rpcClient;
	}
	async generate(params) {
		return mapCreditsExhaustion(this.rpcClient.call("H5_VIDEO_GEN_GENERATE", params, -1));
	}
	async getCompletedJobs() {
		return this.rpcClient.call("H5_POLL_COMPLETED_JOBS", { type: "videoGen" });
	}
	async cancel(jobId) {
		await this.rpcClient.call("H5_VIDEO_GEN_CANCEL", { jobId });
	}
	onJobStarted(callback) {
		return this.rpcClient.onNotification("H5_VIDEO_GEN_JOB_STARTED", callback);
	}
};
//#endregion
//#region src/videoGen/MockVideoGenApi.ts
var MockVideoGenApi = class {
	async generate(_params) {
		console.warn("[RUN] Video generation API not available in mock mode");
		throw new Error("Video generation API requires backend connection");
	}
	async getCompletedJobs() {
		return [];
	}
	async cancel(_jobId) {}
	onJobStarted(_callback) {
		return { unsubscribe: () => {} };
	}
};
//#endregion
//#region src/files/RpcFilesApi.ts
var RpcFilesApi = class {
	rpcClient;
	constructor(rpcClient) {
		this.rpcClient = rpcClient;
	}
	async upload(params) {
		return this.rpcClient.call("H5_FILES_UPLOAD", params);
	}
	async confirmUpload(key, options) {
		return this.rpcClient.call("H5_FILES_CONFIRM_UPLOAD", {
			key,
			...options
		}, -1);
	}
	async batchUpload(params) {
		return this.rpcClient.call("H5_FILES_BATCH_UPLOAD", params);
	}
	async batchCopy(params) {
		return this.rpcClient.call("H5_FILES_BATCH_COPY", params, -1);
	}
	async batchConfirm(keys, options) {
		return this.rpcClient.call("H5_FILES_BATCH_CONFIRM", {
			keys,
			...options
		});
	}
	async getUrl(params) {
		return (await this.rpcClient.call("H5_FILES_GET_URL", params)).url;
	}
	async getUrls(params) {
		return this.rpcClient.call("H5_FILES_GET_URLS", params);
	}
	async getMetadata(params) {
		return this.rpcClient.call("H5_FILES_GET_METADATA", params);
	}
	async exists(params) {
		return this.rpcClient.call("H5_FILES_EXISTS", params);
	}
	async batchGetMetadata(params) {
		return this.rpcClient.call("H5_FILES_BATCH_METADATA", params);
	}
	async batchExists(params) {
		return this.rpcClient.call("H5_FILES_BATCH_EXISTS", params);
	}
	async delete(key) {
		await this.rpcClient.call("H5_FILES_DELETE", { key });
	}
	async list(params) {
		return this.rpcClient.call("H5_FILES_LIST", params ?? {});
	}
	async getQuota() {
		return this.rpcClient.call("H5_FILES_GET_QUOTA", {});
	}
	async hasStorageAvailable(sizeBytes, contentType) {
		const quota = await this.getQuota();
		const cap = contentType === "application/zip" ? quota.maxArchiveBytes : quota.maxFileBytes;
		return quota.availableBytes >= sizeBytes && sizeBytes <= cap;
	}
	async setVisibility(key, visibility) {
		return this.rpcClient.call("H5_FILES_SET_VISIBILITY", {
			key,
			visibility
		});
	}
	async transform(params) {
		return this.rpcClient.call("H5_FILES_TRANSFORM", params, -1);
	}
	async exportToCloudinary(params) {
		return this.rpcClient.call("H5_FILES_EXPORT_CLOUDINARY", params, -1);
	}
	async getCompletedJobs() {
		return this.rpcClient.call("H5_POLL_COMPLETED_JOBS", { type: "files" });
	}
};
//#endregion
//#region src/files/MockFilesApi.ts
var MockFilesApi = class {
	async upload(_params) {
		console.warn("[RUN] Files API not available in mock mode");
		throw new Error("Files API requires backend connection");
	}
	async confirmUpload(_key, _options) {
		throw new Error("Files API requires backend connection");
	}
	async batchUpload(_params) {
		throw new Error("Files API requires backend connection");
	}
	async batchCopy(_params) {
		throw new Error("Files API requires backend connection");
	}
	async batchConfirm(_keys, _options) {
		throw new Error("Files API requires backend connection");
	}
	async getUrl(_params) {
		throw new Error("Files API requires backend connection");
	}
	async getUrls(_params) {
		throw new Error("Files API requires backend connection");
	}
	async getMetadata(_params) {
		throw new Error("Files API requires backend connection");
	}
	async exists(_params) {
		return false;
	}
	async batchGetMetadata(_params) {
		return {
			entries: {},
			ttlMs: 0
		};
	}
	async batchExists(params) {
		const results = {};
		for (const key of params.keys) results[key] = false;
		return { results };
	}
	async delete(_key) {
		throw new Error("Files API requires backend connection");
	}
	async list(_params) {
		return { files: [] };
	}
	async getQuota() {
		return {
			usedBytes: 0,
			capBytes: 0,
			availableBytes: 0,
			maxFileBytes: 0,
			maxArchiveBytes: 0,
			tier: "free"
		};
	}
	async hasStorageAvailable(_sizeBytes, _contentType) {
		return false;
	}
	async setVisibility(_key, _visibility) {
		throw new Error("Files API requires backend connection");
	}
	async transform(_params) {
		throw new Error("Files API requires backend connection");
	}
	async exportToCloudinary(_params) {
		throw new Error("Files API requires backend connection");
	}
	async getCompletedJobs() {
		return [];
	}
};
//#endregion
//#region src/clips/MockClipsApi.ts
var MockClipsApi = class {
	async isSupportedAsync() {
		return {
			canRecord: false,
			canUseMicrophone: false,
			canUseCamera: false,
			reason: "mock host"
		};
	}
	async getCaptureConsentAsync() {
		return {
			status: "granted",
			canAskAgain: true
		};
	}
	async requestCaptureConsentAsync(_opts) {
		return {
			status: "granted",
			canAskAgain: true
		};
	}
	useGameAudio(_node) {}
	async startRecordingAsync(_options) {
		console.warn("[RUN:mock] clips.startRecordingAsync is a no-op");
	}
	captureFrame() {}
	async stopRecordingAsync(_persist) {
		throw new Error("[RUN:mock] clips recording is not available in the mock host");
	}
	async cancelRecordingAsync() {}
	async publishClipAsync(_ugcId) {
		throw new Error("[RUN:mock] clips.publishClipAsync is not available in the mock host");
	}
};
//#endregion
//#region src/threeDGen/RpcThreeDGenApi.ts
var RpcThreeDGenApi = class {
	rpcClient;
	constructor(rpcClient) {
		this.rpcClient = rpcClient;
	}
	async generate(params) {
		return mapCreditsExhaustion(this.rpcClient.call("H5_THREE_D_GEN_GENERATE", params, -1));
	}
	async remesh(params) {
		return mapCreditsExhaustion(this.rpcClient.call("H5_THREE_D_GEN_REMESH", params, -1));
	}
	async rig(params) {
		return mapCreditsExhaustion(this.rpcClient.call("H5_THREE_D_GEN_RIG", params, -1));
	}
	async animate(params) {
		return mapCreditsExhaustion(this.rpcClient.call("H5_THREE_D_GEN_ANIMATE", params, -1));
	}
	async getCompletedJobs() {
		return this.rpcClient.call("H5_POLL_COMPLETED_JOBS", { type: "threeDGen" });
	}
};
//#endregion
//#region src/threeDGen/MockThreeDGenApi.ts
var MockThreeDGenApi = class {
	async generate(_params) {
		console.warn("[RUN] 3D generation API not available in mock mode");
		throw new Error("3D generation API requires backend connection");
	}
	async remesh(_params) {
		console.warn("[RUN] 3D remesh API not available in mock mode");
		throw new Error("3D remesh API requires backend connection");
	}
	async rig(_params) {
		console.warn("[RUN] 3D rig API not available in mock mode");
		throw new Error("3D rig API requires backend connection");
	}
	async animate(_params) {
		console.warn("[RUN] 3D animate API not available in mock mode");
		throw new Error("3D animate API requires backend connection");
	}
	async getCompletedJobs() {
		return [];
	}
};
//#endregion
//#region src/choices/RpcChoicesApi.ts
/**
* RN-bridge implementation of `ChoicesApi`. The RN host receives the
* message, calls the corresponding venus endpoint with the Firebase
* token + GST it already holds, and returns the result. Games (run-tv)
* consume this transparently via `RundotGameAPI.choices.*`.
*/
var RpcChoicesApi = class {
	rpcClient;
	constructor(rpcClient) {
		this.rpcClient = rpcClient;
	}
	async getBalance() {
		return this.rpcClient.call("H5_CHOICES_GET_BALANCE", {});
	}
	async spend(request) {
		return this.rpcClient.call("H5_CHOICES_SPEND", { ...request });
	}
};
//#endregion
//#region src/choices/MockChoicesApi.ts
const TAG = "Mock Choices";
/**
* In-memory Choices wallet for local dev / tests / Storybook. Starts at
* `INITIAL_BALANCE` diamonds and deducts on every spend; replays the
* stored result on retry when the same `clientRequestId` is seen (so
* the mock reflects the real server's idempotency contract).
*
* Intentionally does NOT simulate the `NOT_LINKED` state — the mock
* always behaves as if the user is linked. If you need to test the
* unlinked UX, construct a `MockChoicesApi` variant or inject a
* throwing stub.
*/
const INITIAL_BALANCE = 5e3;
var MockChoicesApi = class {
	balance;
	seenRequests;
	constructor(initialBalance = INITIAL_BALANCE) {
		this.balance = initialBalance;
		this.seenRequests = /* @__PURE__ */ new Map();
	}
	async getBalance() {
		mockLog(TAG, `getBalance() → ${this.balance}`);
		return { diamonds: this.balance };
	}
	async spend(request) {
		const { amount, reason, clientRequestId } = request;
		if (!clientRequestId || typeof clientRequestId !== "string") throw new RundotApiError("MALFORMED_REQUEST", "clientRequestId is required", 400);
		if (!reason || typeof reason !== "string") throw new RundotApiError("MALFORMED_REQUEST", "reason is required", 400);
		if (typeof amount !== "number" || !Number.isInteger(amount) || amount < 1) throw new RundotApiError("INVALID_AMOUNT", "amount must be a positive integer", 400);
		const prior = this.seenRequests.get(clientRequestId);
		if (prior) {
			mockLog(TAG, `spend() replay for ${clientRequestId}`);
			return {
				...prior,
				alreadyProcessed: true
			};
		}
		if (this.balance < amount) throw new RundotApiError("INSUFFICIENT_FUNDS", `balance ${this.balance} < amount ${amount}`, 402);
		this.balance -= amount;
		const result = {
			newDiamonds: this.balance,
			amountDebited: amount,
			transactionRef: generateId(),
			alreadyProcessed: false
		};
		this.seenRequests.set(clientRequestId, result);
		mockLog(TAG, `spend(${amount}, "${reason}") → ${this.balance}`);
		return result;
	}
};
//#endregion
//#region src/access-gate/anonymousMultiplayerConfig.ts
/**
* Per-game guest-multiplayer exemption, injected into static config by the host.
* Mind the global: the config lives on `window.rundotGame._config`, NOT on the
* SDK singleton (`window.RundotGameAPI`) — reading it off the API instance
* yields undefined silently and re-gates every guest. Absent config = gated.
*/
function isAnonymousMultiplayerAllowed() {
	if (typeof window === "undefined") return false;
	return (window.rundotGame?._config)?.anonymousMultiplayerAllowed === true;
}
//#endregion
//#region src/access-gate/RpcAccessGateApi.ts
var RpcAccessGateApi = class {
	rpcClient;
	rundotGameApi;
	autoPromptLogin = true;
	inFlightLogin = null;
	constructor(rpcClient, rundotGameApi) {
		this.rpcClient = rpcClient;
		this.rundotGameApi = rundotGameApi;
	}
	getAccessTier() {
		const profile = this.rundotGameApi._profileData;
		if (!profile || profile.isAnonymous) return "anonymous";
		return "authenticated_18plus";
	}
	isAnonymous() {
		return this.getAccessTier() === "anonymous";
	}
	async promptLogin() {
		if (this.inFlightLogin) return this.inFlightLogin;
		this.inFlightLogin = this.doPromptLogin().finally(() => {
			this.inFlightLogin = null;
		});
		return this.inFlightLogin;
	}
	async doPromptLogin() {
		const result = await this.rpcClient.call("H5_PROMPT_LOGIN", {}, -1);
		if (result.success && result.profile) this.rundotGameApi._profileData = sanitizeProfile(result.profile);
		return result;
	}
};
//#endregion
//#region src/access-gate/index.ts
function initializeAccessGate(rundotGameApi, host) {
	rundotGameApi.accessGate = host.accessGate;
}
//#endregion
//#region src/video/RpcVideoApi.ts
var RpcVideoApi = class {
	rpcClient;
	constructor(rpcClient) {
		this.rpcClient = rpcClient;
	}
	async requestPiPAsync(input) {
		return await this.rpcClient.call("H5_VIDEO_REQUEST_PIP", input);
	}
	async readyForPlaybackResumeAsync(input) {
		await this.rpcClient.call("H5_VIDEO_WEB_READY", input);
	}
	async resumeAckAsync(input) {
		await this.rpcClient.call("H5_VIDEO_RESUME_ACK", input);
	}
	onResumeFromNativePlayback(callback) {
		return this.rpcClient.onNotification("H5_VIDEO_RESUME_FROM_NATIVE_PLAYBACK", callback);
	}
};
//#endregion
//#region src/video/index.ts
function initializeVideo(rundotGameApi, host) {
	rundotGameApi.video = host.video;
}
//#endregion
//#region src/activity/RpcActivityApi.ts
var RpcActivityApi = class {
	rpcClient;
	constructor(rpcClient) {
		this.rpcClient = rpcClient;
	}
	async startActivityAsync(intent) {
		try {
			return await this.rpcClient.call("H5_ACTIVITY_START", intent);
		} catch (error) {
			if (isUnsupportedMessageError(error)) return {
				activityId: `unsupported:${intent.key}`,
				status: "skipped",
				reason: "unsupported_surface"
			};
			throw error;
		}
	}
	updateActivity(input) {
		this.rpcClient.notify("H5_ACTIVITY_UPDATE", input);
	}
	async endActivityAsync(input) {
		try {
			await this.rpcClient.call("H5_ACTIVITY_END", input);
		} catch (error) {
			if (isUnsupportedMessageError(error)) return;
			throw error;
		}
	}
	onActivityAction(callback) {
		return this.rpcClient.onNotification("ACTIVITY_ACTION", (payload) => {
			if (!isActivityActionEvent(payload)) return;
			callback(payload);
		});
	}
};
//#endregion
//#region src/activity/index.ts
function initializeActivity(rundotGameApi, host) {
	rundotGameApi.activity = host.activity;
}
//#endregion
//#region src/app/RpcAdminUgcApi.ts
var RpcAdminUgcApi = class {
	rpcClient;
	constructor(rpcClient) {
		this.rpcClient = rpcClient;
	}
	async browse(params) {
		return this.rpcClient.call("H5_APP_ADMIN_UGC_BROWSE", params ?? {});
	}
	async removeEntry(entryId) {
		await this.rpcClient.call("H5_APP_ADMIN_UGC_REMOVE_ENTRY", { entryId });
	}
	async listReports(params) {
		return this.rpcClient.call("H5_APP_ADMIN_UGC_LIST_REPORTS", params ?? {});
	}
	async resolveReport(reportId, action) {
		await this.rpcClient.call("H5_APP_ADMIN_UGC_RESOLVE_REPORT", {
			reportId,
			action
		});
	}
};
//#endregion
//#region src/app/RpcAppApi.ts
var RpcAppApi = class {
	rpcClient;
	adminUgc;
	adminImageGen;
	adminVideoGen;
	adminSpriteGen;
	adminAudioGen;
	adminThreeDGen;
	constructor(rpcClient) {
		this.rpcClient = rpcClient;
		this.adminUgc = new RpcAdminUgcApi(rpcClient);
		this.adminImageGen = createRpcAdminGenApi(rpcClient, {
			browse: "H5_APP_ADMIN_IMAGEGEN_BROWSE",
			removeEntry: "H5_APP_ADMIN_IMAGEGEN_REMOVE_ENTRY",
			listReports: "H5_APP_ADMIN_IMAGEGEN_LIST_REPORTS",
			resolveReport: "H5_APP_ADMIN_IMAGEGEN_RESOLVE_REPORT"
		});
		this.adminVideoGen = createRpcAdminGenApi(rpcClient, {
			browse: "H5_APP_ADMIN_VIDEOGEN_BROWSE",
			removeEntry: "H5_APP_ADMIN_VIDEOGEN_REMOVE_ENTRY",
			listReports: "H5_APP_ADMIN_VIDEOGEN_LIST_REPORTS",
			resolveReport: "H5_APP_ADMIN_VIDEOGEN_RESOLVE_REPORT"
		});
		this.adminSpriteGen = createRpcAdminGenApi(rpcClient, {
			browse: "H5_APP_ADMIN_SPRITEGEN_BROWSE",
			removeEntry: "H5_APP_ADMIN_SPRITEGEN_REMOVE_ENTRY",
			listReports: "H5_APP_ADMIN_SPRITEGEN_LIST_REPORTS",
			resolveReport: "H5_APP_ADMIN_SPRITEGEN_RESOLVE_REPORT"
		});
		this.adminAudioGen = createRpcAdminGenApi(rpcClient, {
			browse: "H5_APP_ADMIN_AUDIOGEN_BROWSE",
			removeEntry: "H5_APP_ADMIN_AUDIOGEN_REMOVE_ENTRY",
			listReports: "H5_APP_ADMIN_AUDIOGEN_LIST_REPORTS",
			resolveReport: "H5_APP_ADMIN_AUDIOGEN_RESOLVE_REPORT"
		});
		this.adminThreeDGen = createRpcAdminGenApi(rpcClient, {
			browse: "H5_APP_ADMIN_THREEDGEN_BROWSE",
			removeEntry: "H5_APP_ADMIN_THREEDGEN_REMOVE_ENTRY",
			listReports: "H5_APP_ADMIN_THREEDGEN_LIST_REPORTS",
			resolveReport: "H5_APP_ADMIN_THREEDGEN_RESOLVE_REPORT"
		});
	}
	async getMyRole() {
		return (await this.rpcClient.call("H5_APP_GET_MY_ROLE", {})).role;
	}
	async resolveLaunchIntent(options) {
		return this.rpcClient.call("H5_RESOLVE_LAUNCH_INTENT", { maxWaitMs: options?.maxWaitMs });
	}
	async getReleaseNotesAsync() {
		return (await this.rpcClient.call("H5_GET_RELEASE_NOTES")).releaseNotes;
	}
	async openReleaseNotesAsync() {
		await this.rpcClient.call("H5_OPEN_RELEASE_NOTES");
	}
};
//#endregion
//#region src/app/index.ts
function initializeApp(rundotGameApiInstance, host) {
	rundotGameApiInstance.app = host.app;
}
//#endregion
//#region src/attribution/RpcAttributionApi.ts
var RpcAttributionApi = class {
	rpcClient;
	constructor(rpcClient) {
		this.rpcClient = rpcClient;
	}
	async getAttributionParams() {
		return this.rpcClient.call("H5_GET_ATTRIBUTION_PARAMS", {});
	}
};
//#endregion
//#region src/playable/RpcPlayableApi.ts
var RpcPlayableApi = class {
	rpcClient;
	rundotGameApi;
	preSaveHooks = /* @__PURE__ */ new Set();
	constructor(rpcClient, rundotGameApi) {
		this.rpcClient = rpcClient;
		this.rundotGameApi = rundotGameApi;
		this.rpcClient.onNotification("HOST_FLUSH_STATE", async () => {
			try {
				for (const hook of this.preSaveHooks) await hook();
			} catch (error) {
				console.error("[RUN:playable] Error running preSave hook:", error);
			} finally {
				this.rpcClient.notify("H5_FLUSH_STATE_ACK", {
					success: true,
					timestamp: Date.now()
				});
			}
		});
	}
	isPlayable() {
		const env = this.rundotGameApi._environmentData;
		if (!env) return false;
		return env.executionMode === "playable";
	}
	async cta(options) {
		try {
			return await this.rpcClient.call("H5_PLAYABLE_CTA", options ?? {});
		} catch {
			return { completed: false };
		}
	}
	async complete(outcome) {
		try {
			await this.rpcClient.call("H5_PLAYABLE_COMPLETE", outcome ?? {});
		} catch {}
	}
	milestone(name, params) {
		this.rpcClient.notify("H5_PLAYABLE_MILESTONE", {
			name,
			params: params ?? {},
			timestamp: Date.now()
		});
	}
	onPreSave(hook) {
		this.preSaveHooks.add(hook);
		return () => {
			this.preSaveHooks.delete(hook);
		};
	}
};
//#endregion
//#region src/playable/index.ts
function initializePlayable(rundotGameApiInstance, host) {
	rundotGameApiInstance.playable = host.playable;
}
//#endregion
//#region src/MockHost.ts
const ROOMS_UNAVAILABLE_MESSAGE = "[RUN] Rooms API is only available when running inside the RUN.world host environment.";
function createUnavailableRoomsApi() {
	const roomsUnavailableError = () => /* @__PURE__ */ new Error(ROOMS_UNAVAILABLE_MESSAGE);
	return {
		async createRoomAsync() {
			throw roomsUnavailableError();
		},
		async joinOrCreateRoomAsync() {
			throw roomsUnavailableError();
		},
		async joinRoomByCodeAsync() {
			throw roomsUnavailableError();
		},
		async getUserRoomsAsync() {
			throw roomsUnavailableError();
		},
		async subscribeAsync() {
			throw roomsUnavailableError();
		},
		async updateRoomDataAsync() {
			throw roomsUnavailableError();
		},
		async getRoomDataAsync() {
			throw roomsUnavailableError();
		},
		async sendRoomMessageAsync() {
			throw roomsUnavailableError();
		},
		async leaveRoomAsync() {
			throw roomsUnavailableError();
		},
		async kickPlayerAsync() {
			throw roomsUnavailableError();
		},
		async startRoomGameAsync() {
			throw roomsUnavailableError();
		},
		async proposeMoveAsync() {
			throw roomsUnavailableError();
		},
		async validateMoveAsync() {
			throw roomsUnavailableError();
		}
	};
}
const SIMULATION_UNAVAILABLE_MESSAGE = "[RUN] Simulation API is only available when running inside the RUN.world host environment.";
function createUnavailableSimulationApi() {
	const simulationUnavailableError = () => /* @__PURE__ */ new Error(SIMULATION_UNAVAILABLE_MESSAGE);
	return {
		isEnabled() {
			return false;
		},
		async getStateAsync() {
			throw simulationUnavailableError();
		},
		async getConfigAsync() {
			throw simulationUnavailableError();
		},
		async executeRecipeAsync() {
			throw simulationUnavailableError();
		},
		async getActiveRunsAsync() {
			throw simulationUnavailableError();
		},
		async collectRecipeAsync() {
			throw simulationUnavailableError();
		},
		async executeScopedRecipeAsync() {
			throw simulationUnavailableError();
		},
		async triggerRecipeChainAsync() {
			throw simulationUnavailableError();
		},
		async getAvailableRecipesAsync() {
			throw simulationUnavailableError();
		},
		async getRecipeRequirementsAsync() {
			throw simulationUnavailableError();
		},
		async getBatchRecipeRequirementsAsync() {
			throw simulationUnavailableError();
		},
		async resolveFieldValueAsync() {
			throw simulationUnavailableError();
		},
		async getEntityMetadataAsync() {
			throw simulationUnavailableError();
		},
		async getSlotContainersAsync() {
			throw simulationUnavailableError();
		},
		async getSlotAssignmentsAsync() {
			throw simulationUnavailableError();
		},
		async assignItemToSlotAsync() {
			throw simulationUnavailableError();
		},
		async removeItemFromSlotAsync() {
			throw simulationUnavailableError();
		},
		async getAvailableItemsAsync() {
			throw simulationUnavailableError();
		},
		async calculatePowerPreviewAsync() {
			throw simulationUnavailableError();
		},
		async validateSlotAssignmentAsync() {
			throw simulationUnavailableError();
		},
		async executeBatchOperationsAsync() {
			throw simulationUnavailableError();
		},
		async subscribeAsync() {
			throw simulationUnavailableError();
		},
		async resetStateAsync() {
			throw simulationUnavailableError();
		}
	};
}
var MockHost = class {
	ads;
	analytics;
	deviceCache;
	appStorage;
	ownerStorage;
	sharedStorage;
	/** @deprecated */
	avatar3d;
	navigation;
	notifications;
	popups;
	profile;
	system;
	cdn;
	time;
	ai;
	textGen;
	haptics;
	gamepad;
	features;
	liveops;
	lifecycle;
	simulation;
	rooms;
	logging;
	iap;
	credits;
	leaderboard;
	ugc;
	preloader;
	social;
	imageGen;
	audioGen;
	videoGen;
	files;
	clips;
	spriteGen;
	threeDGen;
	entitlements;
	choices;
	stats;
	collectibles;
	shop;
	accessGate;
	multiplayer;
	video;
	activity;
	app;
	attribution;
	assetLibrary;
	playable;
	context;
	instanceId = "mock";
	state = 0;
	get isInitialized() {
		return this._isInitialized;
	}
	rundotGameApi;
	_isInitialized = false;
	_overlay;
	_mockLifecyclesApi;
	_mockAdsApi;
	constructor(rundotGameApi) {
		this.rundotGameApi = rundotGameApi;
		this._overlay = this.createOverlay();
		this._mockAdsApi = new MockAdsApi(this._overlay);
		this._mockLifecyclesApi = new MockLifecycleApi();
		this.ads = this._mockAdsApi;
		this.analytics = new MockAnalyticsApi();
		const appUrl = typeof window !== "undefined" ? window.location.href : "";
		this.deviceCache = createMockStorageApi("deviceCache", appUrl);
		this.appStorage = createMockStorageApi("appStorage", appUrl);
		this.ownerStorage = createMockStorageApi("ownerStorage", appUrl);
		this.sharedStorage = {
			open: ({ appId, namespace }) => {
				if (appId === "") throw new Error("sharedStorage.open: appId must be a non-empty string or omitted");
				return createMockStorageApi("appStorage", `mock#shared/${appId ?? "mock-app"}/${namespace}`);
			},
			read: ({ appId }) => {
				if (appId === "") throw new Error("sharedStorage.read: appId must be a non-empty string or omitted");
				return {
					listSources: async () => [],
					getAllFromSource: async () => ({}),
					get: async () => null,
					getAllForKey: async () => []
				};
			}
		};
		this.simulation = createUnavailableSimulationApi();
		this.rooms = createUnavailableRoomsApi();
		this.leaderboard = new MockLeaderboardApi();
		this.ugc = new MockUgcApi();
		this.avatar3d = new MockAvatarApi(rundotGameApi);
		this.navigation = new MockNavigationApi(rundotGameApi);
		this.notifications = new MockNotificationsApi(rundotGameApi);
		this.popups = new MockPopupsApi(this._overlay);
		this.profile = new MockProfileApi(rundotGameApi);
		const deviceApi = new MockDeviceApi(rundotGameApi);
		const environmentApi = new MockEnvironmentApi(rundotGameApi);
		this.system = new MockSystemApi(deviceApi, environmentApi, rundotGameApi);
		this.cdn = new MockCdnApi(rundotGameApi);
		this.time = new MockTimeApi(rundotGameApi);
		this.ai = new MockAiApi();
		this.textGen = this.ai;
		this.haptics = new MockHapticsApi(rundotGameApi);
		this.gamepad = new MockGamepadApi();
		this.features = new MockFeaturesApi();
		this.liveops = new MockLiveOpsApi(() => rundotGameApi._mock?.liveops?.client, {
			getUnitId: () => rundotGameApi._profileData?.id,
			onExposure: (assignment, configVersion) => {
				this.analytics.recordCustomEvent("liveops_experiment_exposure", {
					experiment_id: assignment.experimentId,
					variant_id: assignment.variantId,
					variant_weight: assignment.variantWeight,
					total_weight: assignment.totalWeight,
					config_version: configVersion
				}).catch(() => {});
			}
		});
		this.lifecycle = this._mockLifecyclesApi;
		this.logging = new MockLoggingApi();
		this.iap = new MockIapApi();
		this.credits = new MockCreditsApi();
		this.social = new MockSocialApi();
		this.imageGen = new MockImageGenApi();
		this.audioGen = new MockAudioGenApi();
		this.videoGen = new MockVideoGenApi();
		this.files = new MockFilesApi();
		this.clips = new MockClipsApi();
		this.spriteGen = new MockSpriteGenApi();
		this.threeDGen = new MockThreeDGenApi();
		this.entitlements = new MockEntitlementApi();
		this.choices = new MockChoicesApi();
		this.stats = new MockStatsApi();
		this.collectibles = new MockCollectiblesApi();
		this.shop = new MockShopApi();
		this.video = new MockVideoApi();
		this.activity = new MockActivityApi();
		this.app = new MockAppApi(rundotGameApi);
		this.attribution = new MockAttributionApi();
		this.assetLibrary = new MockAssetLibraryApi(rundotGameApi);
		this.playable = new MockPlayableApi(rundotGameApi);
		initializeRoomsApi(this.rundotGameApi, this);
		this.preloader = new MockPreloaderApi();
		rundotGameApi.isMock = () => true;
		this.rundotGameApi.sharedAssets = this.assetLibrary;
		this.accessGate = new MockAccessGateApi(rundotGameApi);
		this.multiplayer = new MockMultiplayerApi({ getProfile: () => rundotGameApi.getProfile() });
		applyAccessGates(this);
	}
	initialize(options) {
		this._isInitialized = true;
		this.rundotGameApi._profileData = this.profile.getCurrentProfile();
		this.rundotGameApi._deviceData = this.system.getDevice();
		this.rundotGameApi._environmentData = this.system.getEnvironment();
		this.rundotGameApi._localeData = this.rundotGameApi._mock?.locale || "en-US";
		this.rundotGameApi._languageCodeData = this.rundotGameApi._mock?.languageCode || "en";
		applySafeAreaUpdate(this.rundotGameApi, this.rundotGameApi._safeAreaData || {
			top: 0,
			right: 0,
			bottom: 0,
			left: 0
		});
		if (typeof window !== "undefined") window.addEventListener("resize", () => {
			const newDevice = this.system.getDevice();
			this.rundotGameApi._deviceData = newDevice;
			this._mockLifecyclesApi.triggerDeviceChanged(newDevice);
		});
		this.context = {
			initializeAsleep: false,
			safeArea: this.rundotGameApi._safeAreaData,
			launchParams: options?.launchParams || { "MOCK_LAUNCH_PARAMS_KEY": "MOCK_LAUNCH_PARAMS_VALUE" },
			shareParams: options?.shareParams || { "MOCK_SHARE_PARAMS_KEY": "MOCK_SHARE_PARAMS_VALUE" },
			notificationParams: {},
			shareLinkId: options?.shareParams ? "mock-share-id" : void 0
		};
		return Promise.resolve(this.context);
	}
	onNotificationParamsUpdate(_callback) {
		return () => {};
	}
	createOverlay() {
		const overlayContainer = document.createElement("div");
		overlayContainer.id = "rundot-game-mock-overlay";
		overlayContainer.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
      z-index: 10000;
    `;
		document.body.appendChild(overlayContainer);
		const adOverlay = this.setupAdOverlay();
		return {
			container: overlayContainer,
			elements: {},
			appVisibilityState: "visible",
			actionSheetOverlay: this.setupActionSheetOverlay(),
			adOverlay,
			showAdOverlay: (adType) => {
				return this.showAdOverlay(adType);
			},
			showActionSheet: (items, options) => {
				return this.showActionSheetOverlay(items, options);
			}
		};
	}
	tryAwake() {
		if (this.state === 2) {
			this.triggerLifecycleEvent("AWAKE");
			this.state = 1;
		}
	}
	trySleep() {
		if (this.state === 1) {
			this.triggerLifecycleEvent("SLEEP");
			this.state = 2;
		}
	}
	tryPlay() {
		if (this.state === 3) {
			this.triggerLifecycleEvent("AWAKE");
			this.state = 1;
			this.triggerLifecycleEvent("RESUME");
			this.state = 0;
		}
	}
	tryQuit() {
		if (this.state === 0) {
			this.triggerLifecycleEvent("PAUSE");
			this.state = 1;
		}
		if (this.state === 1) {
			this.triggerLifecycleEvent("SLEEP");
			this.state = 2;
		}
		if (this.state === 2) {
			this.triggerLifecycleEvent("QUIT");
			this.state = 3;
		}
	}
	tryResume() {
		if (this.state === 1) {
			this.triggerLifecycleEvent("RESUME");
			this.state = 0;
		}
	}
	async showAdOverlay(type) {
		return new Promise((resolve, reject) => {
			const overlay = this._overlay;
			const adOverlay = overlay.adOverlay;
			overlay.adOverlay.innerHTML = "";
			const heading = document.createElement("h1");
			heading.style.cssText = `
        font-size: 24px;
        margin-bottom: 20px;
        text-align: center;
      `;
			heading.innerText = type === "interstitial" ? "INTERSTITIAL AD" : "REWARDED VIDEO AD";
			overlay.adOverlay.appendChild(heading);
			const content = document.createElement("div");
			content.style.cssText = `
        width: 300px;
        height: 250px;
        background-color: #1e40af;
        display: flex;
        align-items: center;
        justify-content: center;
        margin-bottom: 20px;
        border-radius: 8px;
      `;
			content.innerText = "Mock Ad Content";
			adOverlay.appendChild(content);
			const timer = document.createElement("p");
			timer.style.cssText = `
        margin-bottom: 20px;
        font-size: 16px;
      `;
			timer.innerText = "Normally ads would have a timer...";
			adOverlay.appendChild(timer);
			const okButton = document.createElement("button");
			okButton.style.cssText = `
        padding: 10px 40px;
        background-color: #2563eb;
        color: white;
        border: none;
        border-radius: 4px;
        font-size: 16px;
        cursor: pointer;
      `;
			okButton.innerText = "Close Ad";
			adOverlay.appendChild(okButton);
			adOverlay.style.display = "flex";
			okButton.onclick = () => {
				this.hideAdOverlay();
				resolve(true);
			};
		});
	}
	hideAdOverlay() {
		const overlay = this._overlay;
		if (overlay.adOverlay) overlay.adOverlay.style.display = "none";
	}
	setupActionSheetOverlay() {
		const actionSheetOverlay = document.createElement("div");
		actionSheetOverlay.id = "rundot-game-action-sheet-overlay";
		actionSheetOverlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background-color: rgba(0, 0, 0, 0.5);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10600;
        font-family: sans-serif;
        display: none;
      `;
		document.body.appendChild(actionSheetOverlay);
		return actionSheetOverlay;
	}
	createOverlayButton(id, text, position, onClick, background, color) {
		const button = document.createElement("button");
		button.id = `rundot-game-mock-${id}-button`;
		button.innerText = text;
		button.style.cssText = `
      position: absolute;
      left: ${position.x}px;
      top: ${position.y}px;
      width: ${position.width}px;
      min-width: ${position.width}px;
      height: ${position.height}px;
      background: ${background};
      color: ${color};
      border: none;
      border-radius: 8px;
      font-family: sans-serif;
      font-weight: bold;
      font-size: ${Math.min(position.width, position.height) / 3}px;
      cursor: pointer;
      pointer-events: auto;
      display: flex;
      align-items: center;
      justify-content: center;
      opacity: 0.9;
      transition: opacity 0.2s;
    `;
		button.addEventListener("click", onClick);
		button.addEventListener("mouseover", () => {
			button.style.opacity = "1";
		});
		button.addEventListener("mouseout", () => {
			button.style.opacity = "0.9";
		});
		return button;
	}
	triggerLifecycleEvent(name) {
		if (name == "PAUSE") this._mockLifecyclesApi.triggerPauseCallbacks();
		else if (name == "RESUME") this._mockLifecyclesApi.triggerResumeCallbacks();
		else if (name == "QUIT") this._mockLifecyclesApi.triggerQuitCallbacks();
		else if (name == "AWAKE") this._mockLifecyclesApi.triggerAwakeCallbacks();
		else if (name == "SLEEP") this._mockLifecyclesApi.triggerSleepCallbacks();
	}
	setupAdOverlay() {
		const adOverlay = document.createElement("div");
		adOverlay.id = "rundot-game-ad-overlay";
		adOverlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background-color: rgba(37, 99, 235, 0.9);
        color: white;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        z-index: 10500;
        font-family: sans-serif;
        display: none;
      `;
		document.body.appendChild(adOverlay);
		return adOverlay;
	}
	showActionSheetOverlay(items, options) {
		return new Promise((resolve, reject) => {
			const overlay = this._overlay;
			overlay.actionSheetOverlay.innerHTML = "";
			overlay.actionSheetOverlay.style.display = "flex";
			const actionSheet = document.createElement("div");
			actionSheet.className = "rundot-game-action-sheet";
			actionSheet.style.cssText = `
        background-color: white;
        border-radius: 8px;
        width: 80%;
        max-width: 400px;
        max-height: 80%;
        display: flex;
        flex-direction: column;
        overflow: hidden;
        color: black;
      `;
			if (options?.title) {
				const titleContainer = document.createElement("div");
				titleContainer.style.cssText = `
          padding: 16px;
          border-bottom: 1px solid #eaeaea;
          font-weight: bold;
          font-size: 18px;
          text-align: center;
          color: black;
        `;
				titleContainer.innerText = options.title;
				actionSheet.appendChild(titleContainer);
			}
			if (options?.message) {
				const messageContainer = document.createElement("div");
				messageContainer.style.cssText = `
          padding: 8px 16px;
          color: #666;
          font-size: 14px;
          text-align: center;
        `;
				messageContainer.innerText = options.message;
				actionSheet.appendChild(messageContainer);
			}
			const optionsContainer = document.createElement("div");
			optionsContainer.style.cssText = `
        overflow-y: auto;
        max-height: 300px;
      `;
			items.forEach((item, index) => {
				const optionItem = document.createElement("div");
				optionItem.style.cssText = `
          padding: 12px 16px;
          border-bottom: 1px solid #eaeaea;
          cursor: pointer;
          display: flex;
          align-items: center;
          transition: background-color 0.2s;
          color: black;
        `;
				optionItem.addEventListener("mouseover", () => {
					optionItem.style.backgroundColor = "#f5f5f5";
				});
				optionItem.addEventListener("mouseout", () => {
					optionItem.style.backgroundColor = "white";
				});
				if (item.icon) {
					const iconSpan = document.createElement("span");
					iconSpan.style.cssText = `
          margin-right: 12px;
          font-size: 16px;
        `;
					iconSpan.innerText = item.icon;
					optionItem.appendChild(iconSpan);
				}
				const labelSpan = document.createElement("span");
				labelSpan.style.cssText = `
        color: black;
      `;
				labelSpan.innerText = item.label;
				optionItem.appendChild(labelSpan);
				optionItem.addEventListener("click", () => {
					this.hideActionSheetOverlay();
					resolve(item.id !== void 0 ? item.id : index);
				});
				optionsContainer.appendChild(optionItem);
			});
			actionSheet.appendChild(optionsContainer);
			if (!options?.disableCancel) {
				const cancelButton = document.createElement("div");
				cancelButton.style.cssText = `
        padding: 14px 16px;
        text-align: center;
        font-weight: bold;
        cursor: pointer;
        color: #3b82f6;
        border-top: 1px solid #eaeaea;
      `;
				cancelButton.innerText = options?.cancelButtonText || "Cancel";
				cancelButton.addEventListener("click", () => {
					this.hideActionSheetOverlay();
					resolve(null);
				});
				actionSheet.appendChild(cancelButton);
			}
			if (!options?.disableCancel) {
				const closeButton = document.createElement("div");
				closeButton.style.cssText = `
          position: absolute;
          top: 8px;
          right: 8px;
          width: 24px;
          height: 24px;
          border-radius: 12px;
          background-color: rgba(0,0,0,0.1);
          color: #666;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          font-size: 14px;
        `;
				closeButton.innerText = "✕";
				closeButton.addEventListener("click", () => {
					this.hideActionSheetOverlay();
					resolve(null);
				});
				actionSheet.appendChild(closeButton);
				overlay.actionSheetOverlay.appendChild(actionSheet);
			}
		});
	}
	hideActionSheetOverlay() {
		const overlay = this._overlay;
		if (overlay.actionSheetOverlay) overlay.actionSheetOverlay.style.display = "none";
	}
};
//#endregion
//#region src/RundotGameTransport.ts
var RundotGameTransport = class {
	messageHandler;
	onNotificationCallbacks = [];
	onNotificationCallbacksToRemove = [];
	onRundotGameMessageCallbacks = [];
	onResponseCallbacks = [];
	onResponseCallbacksToRemove = [];
	_instanceId = null;
	isStarted = false;
	isProcessingMessage = false;
	constructor() {
		this.messageHandler = async (event) => {
			const cfg = typeof window !== "undefined" && window.__rundotConfig || null;
			const expectedParentOrigin = cfg && cfg.parentOrigin || "";
			const expectedNonce = cfg && cfg.nonce || "";
			if (!(event.origin === "" && event.source == null)) {
				if (expectedParentOrigin && event.origin !== expectedParentOrigin) return;
				if (typeof window !== "undefined" && event.source !== window.parent) return;
			}
			this.isProcessingMessage = true;
			let message;
			if (typeof event.data === "string") try {
				message = JSON.parse(event.data);
			} catch {
				this.isProcessingMessage = false;
				return;
			}
			else message = event.data;
			if (!message) {
				this.logInfo("No message found. Ignoring message...");
				this.isProcessingMessage = false;
				return;
			}
			if (expectedNonce && message.nonce !== expectedNonce) {
				this.isProcessingMessage = false;
				return;
			}
			this.notifyRundotGameMessageReceived(message);
			if (message.type === "PAUSE" || message.type === "RESUME" || message.type === "AWAKE" || message.type === "SLEEP" || message.type === "QUIT" || message.type === "IDENTITY_CHANGED" || message.type === "BACK_BUTTON" || message.type === "H5_SYSTEM_FULLSCREEN_STATE_CHANGED" || message.type === "H5_SYSTEM_POINTER_INPUT" || message.type === "H5_SAFE_AREA_CHANGED" || message.type === "H5_DEVICE_CHANGED") {
				const notification = {
					type: "rpc-notification",
					id: message.type,
					payload: message.data
				};
				this.handleNotification(notification);
				this.isProcessingMessage = false;
				return;
			}
			const messageData = message.data;
			if (!messageData) {
				this.logWarn("No data found. Ignoring message...");
				this.isProcessingMessage = false;
				return;
			}
			if (message.type === "H5_SIMULATION_UPDATE") {
				const notification = {
					type: "rpc-notification",
					id: message.type,
					payload: message.data
				};
				this.handleNotification(notification);
				this.isProcessingMessage = false;
				return;
			}
			if (message.type === "H5_VIDEO_RESUME_FROM_NATIVE_PLAYBACK") {
				const notification = {
					type: "rpc-notification",
					id: message.type,
					payload: message.data
				};
				this.handleNotification(notification);
				this.isProcessingMessage = false;
				return;
			}
			if (message.type === "H5_VIDEO_GEN_JOB_STARTED") {
				const notification = {
					type: "rpc-notification",
					id: message.type,
					payload: message.data
				};
				this.handleNotification(notification);
				this.isProcessingMessage = false;
				return;
			}
			if (message.type === "NOTIFICATION_PARAMS_UPDATE") {
				const notification = {
					type: "rpc-notification",
					id: message.type,
					payload: message.data
				};
				this.handleNotification(notification);
				this.isProcessingMessage = false;
				return;
			}
			if (message.type === "CREDITS_BALANCE_UPDATE") {
				const notification = {
					type: "rpc-notification",
					id: message.type,
					payload: message.data
				};
				this.handleNotification(notification);
				this.isProcessingMessage = false;
				return;
			}
			if (message.type === "ACTIVITY_ACTION") {
				const notification = {
					type: "rpc-notification",
					id: message.type,
					payload: message.data
				};
				this.handleNotification(notification);
				this.isProcessingMessage = false;
				return;
			}
			if (message.type === "GAMEPAD_SNAPSHOT" || message.type === "GAMEPAD_CONNECTED" || message.type === "GAMEPAD_DISCONNECTED") {
				const notification = {
					type: "rpc-notification",
					id: message.type,
					payload: message.data
				};
				this.handleNotification(notification);
				this.isProcessingMessage = false;
				return;
			}
			if (message.type === "H5_AI_CHAT_COMPLETION_STREAM_CHUNK" || message.type === "H5_AI_CHAT_COMPLETION_STREAM_DONE" || message.type === "H5_AI_CHAT_COMPLETION_STREAM_ERROR") {
				const notification = {
					type: "rpc-notification",
					id: message.type,
					payload: message.data
				};
				this.handleNotification(notification);
				this.isProcessingMessage = false;
				return;
			}
			if (message.type === "HOST_FLUSH_STATE") {
				const notification = {
					type: "rpc-notification",
					id: message.type,
					payload: message.data
				};
				this.handleNotification(notification);
				this.isProcessingMessage = false;
				return;
			}
			const requestId = messageData.requestId;
			if (!requestId) {
				this.logWarn("No requestId. Ignoring message...");
				this.isProcessingMessage = false;
				return;
			}
			if (message.type !== "H5_RESPONSE") {
				this.logWarn(`Ignoring unknown message type: ${message.type}`);
				this.isProcessingMessage = false;
				return;
			}
			const success = messageData.success;
			let error = void 0;
			if (!success) error = {
				message: messageData.error || "Unknown error",
				...messageData.errorCode ? { code: messageData.errorCode } : {},
				...messageData.errorDetail ? { detail: messageData.errorDetail } : {},
				...messageData.errorInfo ? { errorDetail: messageData.errorInfo } : {},
				...messageData.retryAfterMs !== void 0 ? { retryAfterMs: messageData.retryAfterMs } : {}
			};
			let result = messageData.value;
			if (result === void 0) result = messageData.data;
			const response = {
				type: "rpc-response",
				id: requestId,
				result,
				method: message.type,
				error
			};
			await this.handleResponse(response);
			this.isProcessingMessage = false;
		};
	}
	onNotification(callback) {
		this.onNotificationCallbacks.push(callback);
		return { unsubscribe: () => {
			if (this.isProcessingMessage) this.onNotificationCallbacks.push(callback);
			else this.removeOnNotificationCallback(callback);
		} };
	}
	onRequest(callback) {
		throw new Error("Method not implemented.");
	}
	onResponse(callback) {
		this.onResponseCallbacks.push(callback);
		return { unsubscribe: () => {
			if (this.isProcessingMessage) this.onResponseCallbacksToRemove.push(callback);
			else this.removeOnResponseCallback(callback);
		} };
	}
	get instanceId() {
		return this._instanceId;
	}
	set instanceId(instanceId) {
		this._instanceId = instanceId;
	}
	sendRequest(request) {
		const instanceId = this.instanceId || "unknown";
		const message = {
			type: request.method,
			direction: "H5_TO_APP",
			data: {
				...request.args && typeof request.args === "object" ? request.args : {},
				requestId: request.id
			},
			instanceId,
			timestamp: Date.now()
		};
		this.sendRundotGameMessage(message);
	}
	sendRundotGameMessage(message) {
		const cfg = typeof window !== "undefined" && window.__rundotConfig || null;
		const nonce = cfg && cfg.nonce || "";
		if (nonce && !message.nonce) message.nonce = nonce;
		const messageAsString = JSON.stringify(message, null, 2);
		const reactNativeWebView = window.ReactNativeWebView;
		if (reactNativeWebView) reactNativeWebView.postMessage(messageAsString);
		else {
			const parentOrigin = cfg && cfg.parentOrigin || "*";
			window.parent.postMessage(messageAsString, parentOrigin);
		}
	}
	sendResponse(response) {
		throw new Error("Method not implemented.");
	}
	start() {
		if (this.isStarted) return;
		this.isStarted = true;
		window.addEventListener("message", this.messageHandler, true);
		this.logInfo(`Started`);
	}
	stop() {
		if (!this.isStarted) return;
		this.isStarted = false;
		window.removeEventListener("message", this.messageHandler);
		this.logInfo(`Stopped`);
	}
	handleNotification(notification) {
		for (const callback of this.onNotificationCallbacks) callback(notification);
		for (const callback of this.onNotificationCallbacksToRemove) this.removeOnNotificationCallback(callback);
		this.onNotificationCallbacksToRemove.length = 0;
	}
	async handleResponse(response) {
		for (const callback of this.onResponseCallbacks) if (await callback(response)) break;
		for (const callback of this.onResponseCallbacksToRemove) this.removeOnResponseCallback(callback);
		this.onResponseCallbacksToRemove.length = 0;
	}
	removeOnResponseCallback(callback) {
		this.onResponseCallbacks.splice(this.onResponseCallbacks.indexOf(callback), 1);
	}
	removeOnNotificationCallback(callback) {
		this.onNotificationCallbacks.splice(this.onNotificationCallbacks.indexOf(callback), 1);
	}
	logInfo(message, ...params) {}
	logWarn(message, ...params) {
		console.warn(`[RUN:transport] ${message}`, ...params);
	}
	onRundotGameMessage(callback) {
		this.onRundotGameMessageCallbacks.push(callback);
		return { unsubscribe: () => {
			this.onRundotGameMessageCallbacks.splice(this.onRundotGameMessageCallbacks.indexOf(callback), 1);
		} };
	}
	notifyRundotGameMessageReceived(message) {
		for (const callback of this.onRundotGameMessageCallbacks) callback(message);
	}
};
//#endregion
//#region src/lifecycles/browserLifecycleResumeRecovery.ts
const NOOP_SUBSCRIPTION = { unsubscribe: () => {} };
function attachBrowserLifecycleResumeRecovery(lifecycle, win = typeof window === "undefined" ? void 0 : window, doc = typeof document === "undefined" ? void 0 : document) {
	if (!win || !doc || win.parent === win || typeof win.ReactNativeWebView !== "undefined") return NOOP_SUBSCRIPTION;
	let disposed = false;
	let quitSubscription = null;
	const isVisible = () => !disposed && doc.visibilityState === "visible";
	const onForeground = () => {
		if (isVisible()) lifecycle.scheduleResumeRecovery(isVisible);
	};
	const onVisibilityChange = () => {
		if (isVisible()) lifecycle.scheduleResumeRecovery(isVisible);
		else lifecycle.cancelResumeRecovery();
	};
	const onBackground = () => {
		lifecycle.cancelResumeRecovery();
	};
	const dispose = () => {
		if (disposed) return;
		disposed = true;
		lifecycle.cancelResumeRecovery();
		doc.removeEventListener("visibilitychange", onVisibilityChange);
		doc.removeEventListener("resume", onForeground);
		win.removeEventListener("pageshow", onForeground);
		win.removeEventListener("pagehide", onBackground);
		quitSubscription?.unsubscribe();
		quitSubscription = null;
	};
	doc.addEventListener("visibilitychange", onVisibilityChange);
	doc.addEventListener("resume", onForeground);
	win.addEventListener("pageshow", onForeground);
	win.addEventListener("pagehide", onBackground);
	quitSubscription = lifecycle.onQuit(dispose);
	return { unsubscribe: dispose };
}
//#endregion
//#region src/initSdkArgs.ts
/**
* Builds the args for the INIT_SDK handshake. Previously this was an empty
* `{}`; carrying `sdkVersion` is non-breaking (old hosts ignore unknown
* fields) and unlocks host-side capability gating + rollout observability.
*/
function buildInitSdkArgs() {
	return { sdkVersion: SDK_VERSION };
}
//#endregion
//#region src/social/RpcSocialApi.ts
var RpcSocialApi = class {
	rpcClient;
	lastSentShareIntent = null;
	constructor(rpcClient) {
		this.rpcClient = rpcClient;
	}
	async setShareIntentAsync(options) {
		validateShareIntentParams(options.shareParams);
		validateShareMetadata(options.metadata);
		validateShareTarget(options.target);
		const payload = {
			shareParams: options.shareParams,
			metadata: options.metadata ?? {},
			slug: options.slug,
			target: options.target
		};
		const snapshot = JSON.stringify(payload);
		if (snapshot === this.lastSentShareIntent) return;
		this.lastSentShareIntent = snapshot;
		try {
			await this.rpcClient.call("H5_SHARE_SET_INTENT", payload);
		} catch (error) {
			if (this.lastSentShareIntent === snapshot) this.lastSentShareIntent = null;
			throw error;
		}
	}
	async clearShareIntentAsync() {
		const previous = this.lastSentShareIntent;
		this.lastSentShareIntent = null;
		try {
			await this.rpcClient.call("H5_SHARE_CLEAR_INTENT", {});
		} catch (error) {
			if (this.lastSentShareIntent === null) this.lastSentShareIntent = previous;
			throw error;
		}
	}
	async shareLinkAsync(options) {
		validateShareTarget(options.target);
		const result = await this.rpcClient.call("H5_SHARE_LINK", {
			shareParams: options.shareParams,
			metadata: options.metadata ?? {},
			slug: options.slug,
			target: options.target
		});
		return {
			shareUrl: result.shareUrl,
			shareLinkId: result.shareLinkId
		};
	}
	async createQRCodeAsync(options) {
		validateShareTarget(options.target);
		const result = await this.rpcClient.call("H5_CREATE_SHARE_QRCODE", {
			shareParams: options.shareParams,
			metadata: options.metadata ?? {},
			qrOptions: options.qrOptions ?? {},
			slug: options.slug,
			target: options.target
		});
		return {
			shareUrl: result.shareUrl,
			qrCode: result.qrCode,
			shareLinkId: result.shareLinkId
		};
	}
	async addShareClickDataAsync(options) {
		await this.rpcClient.call("H5_SHARE_ADD_CLICK_DATA", {
			shareLinkId: options.shareLinkId,
			metadata: options.metadata
		});
	}
	async getShareClicksAsync(options) {
		return await this.rpcClient.call("H5_SHARE_GET_CLICKS", { shareLinkId: options.shareLinkId });
	}
	async getMyShareClickDataAsync(options) {
		return await this.rpcClient.call("H5_SHARE_GET_MY_CLICK_DATA", { shareLinkId: options.shareLinkId });
	}
	async shareFileAsync(options) {
		const { data, filename, mimeType, title, text } = options;
		if (!SHARE_FILE_ALLOWED_MIME_TYPES.includes(mimeType)) throw new Error(`unsupported MIME type "${mimeType}". Allowed: ${SHARE_FILE_ALLOWED_MIME_TYPES.join(", ")}`);
		const rawSize = data instanceof Blob ? data.size : data instanceof ArrayBuffer ? data.byteLength : void 0;
		if (rawSize !== void 0 && rawSize > 10485760) throw new Error(`file size (${rawSize} bytes) exceeds max allowed (${SHARE_FILE_MAX_SIZE_BYTES} bytes)`);
		const base64 = await this.toBase64(data);
		if (rawSize === void 0) {
			const len = base64.length;
			const paddingChars = (base64[len - 1] === "=" ? 1 : 0) + (base64[len - 2] === "=" ? 1 : 0);
			const sizeBytes = Math.floor(len * 3 / 4) - paddingChars;
			if (sizeBytes > 10485760) throw new Error(`file size (${sizeBytes} bytes) exceeds max allowed (${SHARE_FILE_MAX_SIZE_BYTES} bytes)`);
		}
		return { cancelled: (await this.rpcClient.call("H5_SHARE_FILE", {
			base64,
			filename,
			mimeType,
			title,
			text
		})).cancelled };
	}
	async canShareFileAsync() {
		return { supported: (await this.rpcClient.call("H5_CAN_SHARE_FILE", {})).supported };
	}
	async composeSocialPostAsync(options) {
		const text = stripComposeControlChars(options.text ?? "");
		const title = options.title === void 0 ? void 0 : stripComposeControlChars(options.title);
		validateComposePost({
			text,
			title,
			subreddit: options.subreddit
		});
		let media;
		if (options.media) {
			validateShareFile(options.media);
			media = {
				base64: await this.toBase64(options.media.data),
				filename: options.media.filename,
				mimeType: options.media.mimeType
			};
		}
		const result = await this.rpcClient.call("H5_SHARE_COMPOSE_POST", {
			text,
			title,
			subreddit: options.subreddit,
			platform: options.platform,
			shareParams: options.shareParams,
			metadata: options.metadata ?? {},
			media
		}, -1);
		return {
			completed: result.completed,
			destination: result.destination
		};
	}
	async openXFollowMeLinkAsync() {
		return this.openFollowMeLink("x");
	}
	async openInstagramFollowMeLinkAsync() {
		return this.openFollowMeLink("instagram");
	}
	async openTikTokFollowMeLinkAsync() {
		return this.openFollowMeLink("tiktok");
	}
	async openDiscordFollowMeLinkAsync() {
		return this.openFollowMeLink("discord");
	}
	async getConfiguredFollowMePlatformsAsync() {
		return (await this.rpcClient.call("H5_SHARE_GET_FOLLOW_ME_PLATFORMS", {})).platforms;
	}
	async openFollowMeLink(platform) {
		const result = await this.rpcClient.call("H5_SHARE_OPEN_FOLLOW_ME", { platform }, -1);
		return {
			completed: result.completed,
			reason: result.reason
		};
	}
	async toBase64(data) {
		if (typeof data === "string") return data;
		const blob = data instanceof Blob ? data : new Blob([data]);
		return new Promise((resolve, reject) => {
			const reader = new FileReader();
			reader.onload = () => {
				const dataUrl = reader.result;
				const commaIdx = dataUrl.indexOf(",");
				resolve(commaIdx >= 0 ? dataUrl.slice(commaIdx + 1) : dataUrl);
			};
			reader.onerror = () => reject(reader.error);
			reader.readAsDataURL(blob);
		});
	}
};
//#endregion
//#region src/clips/RpcCaptureConsent.ts
var RpcCaptureConsent = class {
	rpcClient;
	constructor(rpcClient) {
		this.rpcClient = rpcClient;
	}
	get() {
		return this.rpcClient.call("H5_CLIPS_GET_CAPTURE_CONSENT");
	}
	request(opts) {
		return this.rpcClient.call("H5_CLIPS_REQUEST_CAPTURE_CONSENT", opts, -1);
	}
	set(status) {
		return this.rpcClient.call("H5_CLIPS_SET_CAPTURE_CONSENT", { status });
	}
};
//#endregion
//#region src/RemoteHost.ts
var RemoteHost = class {
	ads;
	analytics;
	deviceCache;
	appStorage;
	ownerStorage;
	sharedStorage;
	/** @deprecated */
	avatar3d;
	navigation;
	notifications;
	popups;
	profile;
	system;
	cdn;
	time;
	ai;
	textGen;
	haptics;
	gamepad;
	features;
	liveops;
	lifecycle;
	simulation;
	rooms;
	logging;
	iap;
	credits;
	leaderboard;
	ugc;
	preloader;
	social;
	imageGen;
	audioGen;
	videoGen;
	files;
	clips;
	spriteGen;
	threeDGen;
	entitlements;
	choices;
	stats;
	collectibles;
	shop;
	accessGate;
	multiplayer;
	video;
	activity;
	app;
	attribution;
	assetLibrary;
	playable;
	/** See GatableHost.anonymousMultiplayerAllowed. */
	anonymousMultiplayerAllowed;
	context;
	instanceId = "unknown";
	get isInitialized() {
		return this._isInitialized;
	}
	rundotGameApi;
	rpcClient;
	_isInitialized = false;
	_roomServerUrl = "";
	lifecycleRecoverySubscription = null;
	constructor(rundotGameApi) {
		this.rundotGameApi = rundotGameApi;
		const rpcClient = new RpcClient();
		this.rpcClient = rpcClient;
		this.ads = new RpcAdsApi(rpcClient);
		this.analytics = new RpcAnalyticsApi(rpcClient);
		this.deviceCache = new RpcStorageApi(rpcClient, {
			clear: "H5_DEVICE_CACHE_CLEAR",
			getItem: "H5_DEVICE_CACHE_GET_ITEM",
			getKey: "H5_DEVICE_CACHE_KEY",
			length: "H5_DEVICE_CACHE_LENGTH",
			removeItem: "H5_DEVICE_CACHE_REMOVE_ITEM",
			setItem: "H5_DEVICE_CACHE_SET_ITEM"
		});
		this.appStorage = new ValidatingStorageApi(new RpcStorageApi(rpcClient, {
			clear: "H5_APP_STORAGE_CLEAR",
			getItem: "H5_APP_STORAGE_GET_ITEM",
			getKey: "H5_APP_STORAGE_KEY",
			length: "H5_APP_STORAGE_LENGTH",
			removeItem: "H5_APP_STORAGE_REMOVE_ITEM",
			setItem: "H5_APP_STORAGE_SET_ITEM",
			getAllItems: "H5_APP_STORAGE_GET_ALL_ITEMS",
			getAllData: "H5_APP_STORAGE_GET_ALL_DATA",
			setMultipleItems: "H5_APP_STORAGE_SET_MULTIPLE_ITEMS",
			removeMultipleItems: "H5_APP_STORAGE_REMOVE_MULTIPLE_ITEMS",
			compareAndSwap: "H5_APP_STORAGE_COMPARE_AND_SWAP",
			getMultipleItems: "H5_APP_STORAGE_GET_MULTIPLE_ITEMS"
		}));
		this.ownerStorage = new ValidatingStorageApi(new RpcStorageApi(rpcClient, {
			clear: "H5_OWNER_STORAGE_CLEAR",
			getItem: "H5_OWNER_STORAGE_GET_ITEM",
			getKey: "H5_OWNER_STORAGE_KEY",
			length: "H5_OWNER_STORAGE_LENGTH",
			removeItem: "H5_OWNER_STORAGE_REMOVE_ITEM",
			setItem: "H5_OWNER_STORAGE_SET_ITEM",
			getAllItems: "H5_OWNER_STORAGE_GET_ALL_ITEMS",
			getAllData: "H5_OWNER_STORAGE_GET_ALL_DATA",
			setMultipleItems: "H5_OWNER_STORAGE_SET_MULTIPLE_ITEMS",
			removeMultipleItems: "H5_OWNER_STORAGE_REMOVE_MULTIPLE_ITEMS"
		}));
		this.sharedStorage = {
			open: ({ appId, namespace }) => {
				if (appId === "") throw new Error("sharedStorage.open: appId must be a non-empty string or omitted");
				return new ValidatingStorageApi(new DualEmitStorageApi(rpcClient, {
					clear: "H5_SHARED_STORAGE_CLEAR",
					getItem: "H5_SHARED_STORAGE_GET_ITEM",
					getKey: "H5_SHARED_STORAGE_KEY",
					length: "H5_SHARED_STORAGE_LENGTH",
					removeItem: "H5_SHARED_STORAGE_REMOVE_ITEM",
					setItem: "H5_SHARED_STORAGE_SET_ITEM",
					getAllItems: "H5_SHARED_STORAGE_GET_ALL_ITEMS",
					getAllData: "H5_SHARED_STORAGE_GET_ALL_DATA",
					setMultipleItems: "H5_SHARED_STORAGE_SET_MULTIPLE_ITEMS",
					removeMultipleItems: "H5_SHARED_STORAGE_REMOVE_MULTIPLE_ITEMS"
				}, {
					targetAppId: appId,
					namespace
				}, {
					clear: "H5_GLOBAL_STORAGE_CLEAR",
					getItem: "H5_GLOBAL_STORAGE_GET_ITEM",
					getKey: "H5_GLOBAL_STORAGE_KEY",
					length: "H5_GLOBAL_STORAGE_LENGTH",
					removeItem: "H5_GLOBAL_STORAGE_REMOVE_ITEM",
					setItem: "H5_GLOBAL_STORAGE_SET_ITEM",
					getAllItems: "H5_GLOBAL_STORAGE_GET_ALL_ITEMS",
					setMultipleItems: "H5_GLOBAL_STORAGE_SET_MULTIPLE_ITEMS",
					removeMultipleItems: "H5_GLOBAL_STORAGE_REMOVE_MULTIPLE_ITEMS"
				}));
			},
			read: ({ appId, namespace }) => {
				if (appId === "") throw new Error("sharedStorage.read: appId must be a non-empty string or omitted");
				return new RpcInboundStorageApi(rpcClient, {
					listSources: "H5_SHARED_STORAGE_INBOUND_LIST_SOURCES",
					get: "H5_SHARED_STORAGE_INBOUND_GET",
					getAllFromSource: "H5_SHARED_STORAGE_INBOUND_GET_ALL_FROM_SOURCE",
					getAllForKey: "H5_SHARED_STORAGE_INBOUND_GET_ALL_FOR_KEY"
				}, {
					targetAppId: appId,
					namespace
				});
			}
		};
		this.avatar3d = new RpcAvatarApi(rpcClient, rundotGameApi);
		this.navigation = new RpcNavigationApi(rpcClient, rundotGameApi);
		this.notifications = new RpcNotificationsApi(rpcClient, { recordDeprecationEvent: (eventName) => {
			this.analytics.recordCustomEvent(eventName, {});
		} });
		this.popups = new RpcPopupsApi(rpcClient);
		this.profile = new HostProfileApi(rundotGameApi);
		const deviceApi = new HostDeviceApi(rundotGameApi);
		const environmentApi = new HostEnvironmentApi(rundotGameApi);
		this.system = new HostSystemApi(deviceApi, environmentApi, rundotGameApi, rpcClient);
		this.cdn = new HostCdnApi(rpcClient);
		this.time = new HostTimeApi(rpcClient, rundotGameApi);
		this.ai = new RpcAiApi(rpcClient);
		this.textGen = this.ai;
		this.haptics = new RpcHapticsApi(rpcClient);
		this.gamepad = new RpcGamepadApi(rpcClient, { autoSubscribe: false });
		this.features = new RpcFeaturesApi(rpcClient);
		this.liveops = new RpcLiveOpsApi(rpcClient, {
			getUnitId: () => this.rundotGameApi._profileData?.id,
			onExposure: (assignment, configVersion) => {
				this.analytics.recordCustomEvent("liveops_experiment_exposure", {
					experiment_id: assignment.experimentId,
					variant_id: assignment.variantId,
					variant_weight: assignment.variantWeight,
					total_weight: assignment.totalWeight,
					config_version: configVersion
				}).catch(() => {});
			}
		});
		this.lifecycle = new RpcLifecycleApi(rpcClient);
		this.simulation = new RpcSimulationApi(rpcClient);
		this.rooms = new RpcRoomsApi(rpcClient);
		this.logging = new RpcLoggingApi(this, rpcClient);
		this.iap = new RpcIapApi(rpcClient);
		this.credits = new RpcCreditsApi(rpcClient);
		this.leaderboard = new RpcLeaderboardApi(rpcClient);
		this.ugc = new RpcUgcApi(rpcClient);
		this.preloader = new RpcPreloaderApi(rpcClient);
		this.social = new RpcSocialApi(rpcClient);
		this.imageGen = new RpcImageGenApi(rpcClient);
		this.audioGen = new RpcAudioGenApi(rpcClient);
		this.videoGen = new RpcVideoGenApi(rpcClient);
		this.files = new RpcFilesApi(rpcClient);
		this.clips = new ClipsApiImpl({
			files: this.files,
			ugc: this.ugc,
			captureConsent: new RpcCaptureConsent(rpcClient)
		});
		this.spriteGen = new RpcSpriteGenApi(rpcClient);
		this.threeDGen = new RpcThreeDGenApi(rpcClient);
		this.entitlements = new RpcEntitlementApi(rpcClient);
		this.choices = new RpcChoicesApi(rpcClient);
		this.stats = new RpcStatsApi(rpcClient);
		this.collectibles = new RpcCollectiblesApi(rpcClient);
		this.shop = new RpcShopApi(rpcClient);
		this.video = new RpcVideoApi(rpcClient);
		this.activity = new RpcActivityApi(rpcClient);
		this.app = new RpcAppApi(rpcClient);
		this.attribution = new RpcAttributionApi(rpcClient);
		this.assetLibrary = new RpcAssetLibraryApi(rpcClient, rundotGameApi);
		this.playable = new RpcPlayableApi(rpcClient, rundotGameApi);
		rundotGameApi.isMock = () => false;
		this.rundotGameApi.sharedAssets = this.assetLibrary;
		initializeRoomsApi(this.rundotGameApi, this);
		this.accessGate = new RpcAccessGateApi(rpcClient, rundotGameApi);
		this.multiplayer = new WsMultiplayerApi({
			serverUrl: () => this._roomServerUrl,
			getJoinTicket: async (req) => {
				return (await rpcClient.call("H5_REQUEST_JOIN_TICKET", req)).ticket;
			},
			listUserRooms: async (options) => {
				return (await rpcClient.call("H5_LIST_USER_REALTIME_ROOMS", options ?? {})).rooms;
			}
		});
		this.anonymousMultiplayerAllowed = isAnonymousMultiplayerAllowed;
		applyAccessGates(this);
	}
	async initialize(options) {
		const transport = new RundotGameTransport();
		transport.start();
		this.rpcClient.start(transport);
		wireIdentityReplica(this.rpcClient, this.rundotGameApi);
		wireViewportReplica(this.rpcClient, this.rundotGameApi);
		this.lifecycle.wireNotificationReplay();
		this.rooms.setupNotifications(transport);
		const response = await this.rpcClient.call("INITIALIZE_SDK", buildInitSdkArgs(), -1);
		transport.instanceId = response.instanceId;
		this.instanceId = response.instanceId;
		this._roomServerUrl = response.roomServerUrl ?? "";
		this.rundotGameApi._profileData = sanitizeProfile(response.profile);
		this.rundotGameApi._deviceData = response.device;
		this.rundotGameApi._environmentData = response.environment;
		this.rundotGameApi._localeData = response.locale;
		this.rundotGameApi._languageCodeData = response.languageCode;
		applySafeAreaUpdate(this.rundotGameApi, response.safeArea);
		this._isInitialized = true;
		await this.rpcClient.call("READY", {});
		this.disposeLifecycleRecovery();
		this.lifecycleRecoverySubscription = attachBrowserLifecycleResumeRecovery(this.lifecycle);
		this.gamepad.subscribe();
		const { g2gLaunch, g2gReturn, ...launchParams } = response.launchParams ?? {};
		this.context = buildInitializationContext({
			safeArea: this.rundotGameApi._safeAreaData,
			initializeAsleep: response.initializeAsleep,
			launchParams,
			shareParams: response.shareParams,
			notificationParams: response.notificationParams,
			shareLinkId: response.shareLinkId,
			g2gLaunch,
			g2gReturn
		}, (field) => {
			this.analytics.recordCustomEvent("sdk_deprecated_context_read", { field });
		});
		return this.context;
	}
	/** @internal */
	disposeLifecycleRecovery() {
		this.lifecycleRecoverySubscription?.unsubscribe();
		this.lifecycleRecoverySubscription = null;
	}
	onNotificationParamsUpdate(callback) {
		const subscription = this.rpcClient.onNotification("NOTIFICATION_PARAMS_UPDATE", callback);
		return () => subscription.unsubscribe();
	}
	notifyNotificationParamsSubscribeReady() {
		this.rpcClient.notify("NOTIFICATION_PARAMS_SUBSCRIBE_READY");
	}
};
/**
* Build the `InitializationContext` from the INIT_SDK snapshot. The four launch
* intent fields (`launchParams`, `shareParams`, `notificationParams`,
* `shareLinkId`) are defined as deprecation-warning getters over the snapshot
* values: on first read per field per session they `console.warn` once and
* invoke `onDeprecatedRead`. Only `notificationParams` accepts live updates;
* the other fields remain read-only. These getters are the legacy context read path — they are NOT
* backed by the launch-signal latch and may differ from `resolveLaunchIntent`
* for a deferred link (that is the entire reason the new API exists).
*/
function buildInitializationContext(snapshot, onDeprecatedRead) {
	const context = {
		safeArea: snapshot.safeArea,
		initializeAsleep: snapshot.initializeAsleep,
		g2gLaunch: snapshot.g2gLaunch,
		g2gReturn: snapshot.g2gReturn
	};
	const warned = /* @__PURE__ */ new Set();
	const defineDeprecatedIntentField = (field, value) => {
		Object.defineProperty(context, field, {
			enumerable: true,
			configurable: true,
			get() {
				if (!warned.has(field)) {
					warned.add(field);
					console.warn(`RundotGameAPI.context.${field} is deprecated; use RundotGameAPI.app.resolveLaunchIntent(). Removed in v6.0.0.`);
					onDeprecatedRead?.(field);
				}
				return value;
			},
			set: field === "notificationParams" ? (nextValue) => {
				value = nextValue;
			} : void 0
		});
	};
	defineDeprecatedIntentField("launchParams", snapshot.launchParams);
	defineDeprecatedIntentField("shareParams", snapshot.shareParams);
	defineDeprecatedIntentField("notificationParams", snapshot.notificationParams);
	defineDeprecatedIntentField("shareLinkId", snapshot.shareLinkId);
	return context;
}
//#endregion
//#region src/Host.ts
/**
* Create a Host instance based on the runtime environment.
*
* PlaygroundHost is loaded via a separate entry point (`@series-inc/rundot-game-sdk/playground`)
* which registers a factory on `globalThis.__RUNDOT_PLAYGROUND_HOST_FACTORY__`.
* The Vite playground plugin injects this import automatically, keeping Firebase
* completely out of the main bundle's dependency graph.
*/
async function createHost(rundotGameApi, isMock) {
	if (isMock) {
		const factory = globalThis.__RUNDOT_PLAYGROUND_HOST_FACTORY__;
		if (factory) return factory(rundotGameApi);
		if (getPlaygroundConfig()?.sandboxedOrigin) throw new Error("[RUN] Playground runtime did not load, and this preview has no mock fallback. Reload the preview.");
		return new MockHost(rundotGameApi);
	}
	return new RemoteHost(rundotGameApi);
}
//#endregion
//#region src/social/index.ts
function initializeSocial(rundotGameApi, host) {
	rundotGameApi.social = host.social;
}
//#endregion
//#region src/clips/index.ts
function initializeClips(rundotGameApi, host) {
	rundotGameApi.clips = host.clips;
}
//#endregion
export { RpcImageGenApi as $, base64DecodeInto as $t, initializeStats as A, RpcFeaturesApi as At, initializeSimulation as B, PER_APP_SUBDOMAIN_HOST_PATTERN as Bt, initializePreloader as C, RpcGamepadApi as Ct, RpcShopApi as D, MockLiveOpsApi as Dt, MockShopApi as E, initializeLiveOps as Et, initializeLeaderboard as F, initializeCdn as Ft, RpcStorageApi as G, initializeAvatar3d as Gt, initializeStorage as H, parseCdnLocationFromUrl as Ht, MockLeaderboardApi as I, HostCdnApi as It, initializeSpriteGen as J, RpcAnalyticsApi as Jt, RpcRoomsApi as K, RpcAvatarApi as Kt, RpcLeaderboardApi as L, FILE_EXTENSION_PATTERN as Lt, initializeEntitlements as M, HostSystemApi as Mt, MockEntitlementApi as N, HostEnvironmentApi as Nt, initializeCollectibles as O, RpcLiveOpsApi as Ot, RpcEntitlementApi as P, HostDeviceApi as Pt, MockImageGenApi as Q, readAssetInChunks as Qt, initializeTime as R, MIN_CDN_PATH_SEGMENTS as Rt, initializeUgc as S, initializeGamepad as St, initializeShop as T, RpcHapticsApi as Tt, RpcInboundStorageApi as U, parseCdnLocationFromWindow as Ut, RpcSimulationApi as V, isPerAppSubdomain as Vt, DualEmitStorageApi as W, parseCdnPathSegments as Wt, RpcSpriteGenApi as X, initializeAssetLibrary as Xt, MockSpriteGenApi as Y, initializeTextGen as Yt, initializeImageGen as Z, RpcAssetLibraryApi as Zt, initializeAccessGate as _, RpcLifecycleApi as _t, buildInitializationContext as a, RpcAiApi as an, initializePopups as at, MockClipsApi as b, initializeIap as bt, initializePlayable as c, RpcNotificationsApi as ct, RpcAppApi as d, initializeLoggingApi as dt, base64ToArrayBuffer as en, RpcClient as et, RpcAdminUgcApi as f, RpcLoggingApi as ft, RpcVideoApi as g, sanitizeProfile as gt, initializeVideo as h, wireIdentityReplica as ht, RemoteHost as i, MockAiApi as in, HostProfileApi as it, RpcStatsApi as j, initializeSystem as jt, RpcCollectiblesApi as k, initializeFeaturesApi as kt, RpcPlayableApi as l, initializeStackNavigation as lt, RpcActivityApi as m, wireViewportReplica as mt, initializeSocial as n, isUnsupportedMessageError as nn, initializeProfile as nt, RpcCaptureConsent as o, initializeAds as on, RpcPopupsApi as ot, initializeActivity as p, initializeLifecycleApi as pt, setupRoomNotifications as q, initializeAnalytics as qt, createHost as r, initializeAi as rn, MockProfileApi as rt, RpcSocialApi as s, RpcAdsApi as sn, initializeLocalNotifications as st, initializeClips as t, base64ToUtf8 as tn, SandboxProfileApi as tt, initializeApp as u, RpcNavigationApi as ut, RpcAccessGateApi as v, initializeCredits as vt, RpcPreloaderApi as w, initializeHaptics as wt, MockSocialApi as x, RpcIapApi as xt, isAnonymousMultiplayerAllowed as y, RpcCreditsApi as yt, HostTimeApi as z, PER_APP_LOCAL_HOST_PATTERN as zt };

//# sourceMappingURL=clips-WonLVRGa.js.map