//#region src/version.ts
const SDK_VERSION = "5.29.1";
//#endregion
//#region src/config/playground.ts
/**
* Read playground configuration from the global object.
* Vite injects the config into `window.__RUNDOT_GAME_PLAYGROUND__` during dev builds.
*/
function getPlaygroundConfig() {
	if (typeof globalThis === "undefined") return null;
	const config = globalThis.__RUNDOT_GAME_PLAYGROUND__;
	if (!config?.enabled) return null;
	return config;
}
/**
* Check if playground mode is enabled.
*/
function isPlaygroundEnabled() {
	return getPlaygroundConfig()?.enabled === true;
}
/**
* The proxy path used to route requests through Vite dev server.
* Must match RUNDOT_GAME_API_PROXY_PATH in RundotGamePlaygroundPlugin.ts.
*/
const RUNDOT_GAME_API_PROXY_PATH = "/__rundotgameapi";
/**
* Build the base URL for Cloud Functions calls.
*
* For local (emulator): Direct URL to emulator (no CORS issues)
* For dev/staging: Uses Vite proxy path to avoid CORS issues
*/
function buildFunctionsBaseUrl(config) {
	if (config.backendUrl) return config.backendUrl.replace(/\/$/, "");
	if (typeof window !== "undefined") return RUNDOT_GAME_API_PROXY_PATH;
	if (config.firebaseConfig?.projectId && config.functionsRegion) {
		const region = config.functionsRegion || "us-central1";
		if (config.target === "local" && config.functionsEmulatorHost) return `http://${config.functionsEmulatorHost}/${config.firebaseConfig.projectId}/${region}`;
		return `https://${region}-${config.firebaseConfig.projectId}.cloudfunctions.net`;
	}
	throw new Error(`[RUN] Cannot determine backend URL for target "${config.target}". Either provide backendUrl or configure Firebase project settings.`);
}
/**
* Get the Cloud Run base URL from playground config.
* Used by HTTP-based APIs (UGC, ImageGen) for direct Cloud Run calls.
*
* @returns Cloud Run URL without trailing slash, defaults to localhost:3000
*/
function getCloudRunUrl() {
	const config = getPlaygroundConfig();
	if (config && "cloudRunUrl" in config && typeof config.cloudRunUrl === "string") return config.cloudRunUrl.replace(/\/$/, "");
	return "http://localhost:3000";
}
/**
* Hosted multiplayer room-server base URL from playground config, if configured.
* Only the `playground` target is wired with one (by the Vite plugin). When
* absent, PlaygroundHost falls back to the local dev sidecar / offline mock.
*
* @returns room-server URL without trailing slash, or undefined when unset
*/
function getPlaygroundRoomServerUrl() {
	const config = getPlaygroundConfig();
	if (config && typeof config.roomServerUrl === "string" && config.roomServerUrl) return config.roomServerUrl.replace(/\/$/, "");
}
//#endregion
export { isPlaygroundEnabled as a, getPlaygroundRoomServerUrl as i, getCloudRunUrl as n, SDK_VERSION as o, getPlaygroundConfig as r, buildFunctionsBaseUrl as t };

//# sourceMappingURL=playground-DX6FPhtu.js.map