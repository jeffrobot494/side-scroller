//#region src/errors.ts
/**
* Base error for rundot API failures that include a machine-readable code.
* Thrown by SDK methods when the server returns a structured error response.
*/
var RundotApiError = class extends Error {
	code;
	/** HTTP status when the error came over HTTP; `0` for transport/RPC errors with no HTTP status. */
	status;
	/**
	* Optional human-readable cause from the server (e.g. an upstream provider's
	* validation message), surfaced alongside the controlled `message` so callers
	* can show the specific reason rather than a generic failure.
	*
	* This is a flattened STRING. For the machine-readable breakdown of a
	* provider rejection (type / reason / offending field), use `errorDetail`.
	*/
	detail;
	/**
	* Optional structured provider rejection detail (e.g.
	* `{ type: 'content_policy_violation', reason: 'partner_validation_failed' }`).
	* Unlike `detail` (a display string), this is meant for programmatic handling.
	*/
	errorDetail;
	constructor(code, message, status = 0, detail, errorDetail) {
		super(message);
		this.name = "RundotApiError";
		this.code = code;
		this.status = status;
		this.detail = detail;
		this.errorDetail = errorDetail;
	}
};
/**
* Thrown when a request is rate-limited (HTTP 429).
* `retryAfterMs` indicates how long to wait before retrying.
*/
var RateLimitedError = class extends RundotApiError {
	retryAfterMs;
	constructor(retryAfterMs, message) {
		super("RATE_LIMITED", message ?? `Rate limited. Retry after ${Math.ceil(retryAfterMs / 1e3)}s.`, 429);
		this.name = "RateLimitedError";
		this.retryAfterMs = retryAfterMs;
	}
};
//#endregion
//#region src/credits/CreditsApi.ts
/**
* Canonical machine discriminator for creator-credits exhaustion. Mirrors the
* server's `CREDITS_EXHAUSTED_CODE`: the host rejects an exhausted generation
* with this `code`, and the SDK reconstructs the typed error from it. Single
* source of truth — never write the literal elsewhere in the SDK.
*/
const CREDITS_EXHAUSTED_CODE = "CREDITS_EXHAUSTED";
/**
* Thrown from AI generation calls (ai / imageGen / videoGen) when the
* player-billed game runs the player out of creator credits and the host did
* not (or could not) resolve the deficit. `paywallShown`/`paywallOutcome`
* describe what the host did before giving up — see `setAutoPaywallOnExhaustion`
* / `setAutoRetryOnPurchase`.
*/
var CreditsExhaustedError = class extends Error {
	code = CREDITS_EXHAUSTED_CODE;
	billedTo;
	paywallShown;
	/** `null` when `paywallShown === false`. */
	paywallOutcome;
	constructor(message, info) {
		super(message);
		this.name = "CreditsExhaustedError";
		this.billedTo = info.billedTo;
		this.paywallShown = info.paywallShown;
		this.paywallOutcome = info.paywallOutcome;
	}
};
/** True iff `err` is (or carries the wire signature of) a credits-exhaustion
*  error. Derived from {@link asCreditsExhaustedError} so the predicate and the
*  narrowing can never disagree. */
function isCreditsExhaustedError(err) {
	return asCreditsExhaustedError(err) !== null;
}
/**
* Reconstruct a {@link CreditsExhaustedError} from a transport error. The host
* rejects the RPC with `code === 'CREDITS_EXHAUSTED'` and a JSON-encoded
* `detail` carrying `{ billedTo, paywallShown, paywallOutcome }`; this turns
* that wire shape back into a typed error. Returns `null` for any other error.
*/
function asCreditsExhaustedError(err) {
	if (err instanceof CreditsExhaustedError) return err;
	if (err === null || typeof err !== "object") return null;
	if (err.code !== "CREDITS_EXHAUSTED") return null;
	let billedTo = "owner";
	let paywallShown = false;
	let paywallOutcome = null;
	const detail = err.detail;
	if (typeof detail === "string" && detail.length > 0) try {
		const parsed = JSON.parse(detail);
		if (parsed.billedTo === "owner" || parsed.billedTo === "player") billedTo = parsed.billedTo;
		if (typeof parsed.paywallShown === "boolean") paywallShown = parsed.paywallShown;
		if (parsed.paywallOutcome === "purchased" || parsed.paywallOutcome === "cancelled" || parsed.paywallOutcome === "pending" || parsed.paywallOutcome === null) paywallOutcome = parsed.paywallOutcome;
	} catch {}
	return new CreditsExhaustedError(err instanceof RundotApiError || err instanceof Error ? err.message : "Creator credits exhausted", {
		billedTo,
		paywallShown,
		paywallOutcome
	});
}
/**
* Await an RPC generation call, re-throwing creator-credits exhaustion as the
* typed {@link CreditsExhaustedError} and passing every other error through
* untouched. The single place the generation namespaces (ai / imageGen /
* videoGen) funnel through, so the mapping can't drift between them.
*/
async function mapCreditsExhaustion(call) {
	try {
		return await call;
	} catch (err) {
		throw asCreditsExhaustedError(err) ?? err;
	}
}
//#endregion
//#region src/deprecationWarning.ts
const warned = /* @__PURE__ */ new Set();
/** Warn once (per process) that `oldName` was renamed to `newName`. */
function warnRenamed(oldName, newName) {
	if (warned.has(oldName)) return;
	warned.add(oldName);
	console.warn(`[RUN] "${oldName}" is deprecated and will be removed in the next major version. Use "${newName}" instead.`);
}
/** Warn once (per process) that `feature` is deprecated. */
function warnDeprecated(feature, message) {
	if (warned.has(feature)) return;
	warned.add(feature);
	console.warn(message ?? `[RUN] "${feature}" is deprecated and will be removed in a future release.`);
}
//#endregion
//#region src/imageGen/validateSeed.ts
const MAX_IMAGE_GEN_SEED = 2147483647;
function assertValidImageGenSeed(seed) {
	if (seed === void 0) return;
	if (!Number.isInteger(seed) || seed < 0 || seed > 2147483647) throw new Error(`imageGen: seed must be an integer between 0 and ${MAX_IMAGE_GEN_SEED} (got ${seed})`);
}
//#endregion
//#region src/utils/utf8.ts
/**
* UTF-8 byte length of a string, computed without TextEncoder so it works in
* every runtime (browser, React Native/Hermes, and the jsdom test env, which
* does not expose TextEncoder). Matches Node's Buffer.byteLength(s, 'utf-8'),
* the measure the server uses for storage key/value and leaderboard metadata
* size limits.
*/
function utf8ByteLength(s) {
	let bytes = 0;
	for (let i = 0; i < s.length; i++) {
		const code = s.charCodeAt(i);
		if (code < 128) bytes += 1;
		else if (code < 2048) bytes += 2;
		else if (code >= 55296 && code <= 56319) {
			bytes += 4;
			i++;
		} else bytes += 3;
	}
	return bytes;
}
//#endregion
//#region src/leaderboard/utils.ts
/**
* Hash algorithm used for score sealing
*/
const HASH_ALGORITHM_WEB_CRYPTO = "SHA-256";
const HASH_ALGORITHM_NODE = "sha256";
/**
* Compute HMAC-SHA256 hash for score sealing.
* Hash always includes: score, duration, token
* Matches server-side hash computation exactly.
*
* @param score - The score value
* @param duration - Duration in seconds
* @param token - Score token
* @param sealingNonce - One-time nonce for this submission
* @param sealingSecret - Secret key for HMAC
* @returns Hex-encoded hash string
*/
async function computeScoreHash(score, duration, token, sealingNonce, sealingSecret) {
	const fullPayload = `${`score:${score}|duration:${duration}|token:${token}`}|nonce:${sealingNonce}`;
	const encoder = new TextEncoder();
	const keyData = encoder.encode(sealingSecret);
	const messageData = encoder.encode(fullPayload);
	const cryptoKey = await crypto.subtle.importKey("raw", keyData, {
		name: "HMAC",
		hash: HASH_ALGORITHM_WEB_CRYPTO
	}, false, ["sign"]);
	const signature = await crypto.subtle.sign("HMAC", cryptoKey, messageData);
	return Array.from(new Uint8Array(signature)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
/**
* Map a submit-score transport error to a typed, non-throwing
* {@link SubmitScoreResult} the game can branch on — or `undefined` when the
* error is a genuine failure that should still throw. Shared by both the RPC and
* HTTP leaderboard impls so every submission surface resolves the same
* pending → ranked/rejected outcomes (identity change, replay rejection) instead
* of one path throwing an opaque error.
*/
function mapSubmitScoreFailure(error) {
	const message = error instanceof Error ? error.message : String(error);
	if (/token does not belong to profile/i.test(message)) return {
		accepted: false,
		failureReason: "identity_changed",
		reason: message
	};
	if (/could not be verified|replay verification failed/i.test(message)) return {
		accepted: false,
		failureReason: "replay_rejected",
		reason: message
	};
}
//#endregion
//#region src/leaderboard/replaySize.ts
/**
* Inline replay-size cap for `requiresReplay` leaderboard submissions.
*
* Set from the M8.5 Task-0 measurement: a representative solo run's
* `exportReplay()` serializes to ~0.28 KB/frame of JSON, so a 2-minute 60 Hz
* run is ~2 MB. 4 MB gives ~2× headroom over that while still bounding an
* authenticated payload. This is the SDK's UX-facing limit — the functions
* submit boundary and the cloud-run verifier enforce their own copies (a
* direct authenticated call bypasses this one).
*/
const REPLAY_INLINE_MAX_BYTES = 4194304;
/**
* Reject a replay that serializes above the inline cap BEFORE any submission is
* attempted, so the game gets an actionable error instead of a silent transport
* failure or a server 413.
*/
function assertReplayWithinInlineCap(replay) {
	const bytes = utf8ByteLength(JSON.stringify(replay));
	if (bytes > 4194304) throw new RundotApiError("PAYLOAD_TOO_LARGE", `Replay of ${bytes} bytes exceeds the inline submission cap of ${REPLAY_INLINE_MAX_BYTES} bytes. Shorten the run or contact support about oversize replay uploads.`, 413);
}
//#endregion
export { mapSubmitScoreFailure as a, warnDeprecated as c, CreditsExhaustedError as d, asCreditsExhaustedError as f, RundotApiError as g, RateLimitedError as h, computeScoreHash as i, warnRenamed as l, mapCreditsExhaustion as m, HASH_ALGORITHM_NODE as n, utf8ByteLength as o, isCreditsExhaustedError as p, HASH_ALGORITHM_WEB_CRYPTO as r, assertValidImageGenSeed as s, assertReplayWithinInlineCap as t, CREDITS_EXHAUSTED_CODE as u };

//# sourceMappingURL=replaySize-CX50idnG.js.map