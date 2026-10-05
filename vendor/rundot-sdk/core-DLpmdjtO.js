//#region src/rundot-game-api/systems/core.js
function createProxiedMethod(methodName, mockImpl) {
	return function(...args) {
		if (methodName.startsWith("on") && typeof args[0] === "function") {
			if (!this._bootstrap._localHandlers) this._bootstrap._localHandlers = {};
			this._bootstrap._localHandlers[methodName] = args[0];
			if (this._bootstrap.rundotGame && typeof this._bootstrap.rundotGame[methodName] === "function") return this._bootstrap.rundotGame[methodName](...args);
			return true;
		}
		if (this._bootstrap.rundotGame && typeof this._bootstrap.rundotGame[methodName] === "function") return this._bootstrap.rundotGame[methodName](...args);
		return mockImpl.apply(this, args);
	};
}
function createProxiedObject(objectName, mockImpl) {
	const self = this;
	function createNestedProxy(target, realApiPath) {
		return new Proxy(target, { get: function(targetObj, prop, receiver) {
			if (self._bootstrap.rundotGame && realApiPath) {
				let realApiValue = self._bootstrap.rundotGame;
				const pathParts = realApiPath.split(".");
				for (const part of pathParts) if (realApiValue && realApiValue[part]) realApiValue = realApiValue[part];
				else {
					realApiValue = null;
					break;
				}
				if (realApiValue && prop in realApiValue) {
					const realValue = Reflect.get(realApiValue, prop, receiver);
					if (realValue && typeof realValue === "object" && typeof realValue !== "function") return createNestedProxy(realValue, `${realApiPath}.${prop}`);
					return realValue;
				}
			}
			const value = Reflect.get(targetObj, prop);
			if (typeof value === "function") return function(...args) {
				return value.apply(self, args);
			};
			if (value && typeof value === "object" && !Array.isArray(value)) return createNestedProxy(value, realApiPath ? `${realApiPath}.${prop}` : prop);
			return value;
		} });
	}
	return createNestedProxy(mockImpl, objectName);
}
function isWebPlatform() {
	return typeof window !== "undefined" && !window.ReactNativeWebView;
}
const MOCK_DELAYS = {
	short: 100,
	medium: 500,
	long: 1e3
};
function createMockDelay(ms = MOCK_DELAYS.short) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}
//#endregion
export { isWebPlatform as a, createProxiedObject as i, createMockDelay as n, createProxiedMethod as r, MOCK_DELAYS as t };

//# sourceMappingURL=core-DLpmdjtO.js.map