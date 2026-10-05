//#region node_modules/glin-profanity/dist/index.js
var __create = Object.create;
var __defProp = Object.defineProperty;
var __defProps = Object.defineProperties;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropDescs = Object.getOwnPropertyDescriptors;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getOwnPropSymbols = Object.getOwnPropertySymbols;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __propIsEnum = Object.prototype.propertyIsEnumerable;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, {
	enumerable: true,
	configurable: true,
	writable: true,
	value
}) : obj[key] = value;
var __spreadValues = (a, b) => {
	for (var prop in b || (b = {})) if (__hasOwnProp.call(b, prop)) __defNormalProp(a, prop, b[prop]);
	if (__getOwnPropSymbols) {
		for (var prop of __getOwnPropSymbols(b)) if (__propIsEnum.call(b, prop)) __defNormalProp(a, prop, b[prop]);
	}
	return a;
};
var __spreadProps = (a, b) => __defProps(a, __getOwnPropDescs(b));
var __commonJS = (cb, mod) => function __require() {
	return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};
var __copyProps = (to, from, except, desc) => {
	if (from && typeof from === "object" || typeof from === "function") {
		for (let key of __getOwnPropNames(from)) if (!__hasOwnProp.call(to, key) && key !== except) __defProp(to, key, {
			get: () => from[key],
			enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable
		});
	}
	return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", {
	value: mod,
	enumerable: true
}) : target, mod));
var __async = (__this, __arguments, generator) => {
	return new Promise((resolve, reject) => {
		var fulfilled = (value) => {
			try {
				step(generator.next(value));
			} catch (e) {
				reject(e);
			}
		};
		var rejected = (value) => {
			try {
				step(generator.throw(value));
			} catch (e) {
				reject(e);
			}
		};
		var step = (x) => x.done ? resolve(x.value) : Promise.resolve(x.value).then(fulfilled, rejected);
		step((generator = generator.apply(__this, __arguments)).next());
	});
};
var require_react_production_min = __commonJS({ "../../node_modules/react/cjs/react.production.min.js"(exports) {
	"use strict";
	var l = Symbol.for("react.element");
	var n = Symbol.for("react.portal");
	var p = Symbol.for("react.fragment");
	var q = Symbol.for("react.strict_mode");
	var r = Symbol.for("react.profiler");
	var t = Symbol.for("react.provider");
	var u = Symbol.for("react.context");
	var v = Symbol.for("react.forward_ref");
	var w = Symbol.for("react.suspense");
	var x = Symbol.for("react.memo");
	var y = Symbol.for("react.lazy");
	var z = Symbol.iterator;
	function A(a) {
		if (null === a || "object" !== typeof a) return null;
		a = z && a[z] || a["@@iterator"];
		return "function" === typeof a ? a : null;
	}
	var B = {
		isMounted: function() {
			return false;
		},
		enqueueForceUpdate: function() {},
		enqueueReplaceState: function() {},
		enqueueSetState: function() {}
	};
	var C = Object.assign;
	var D = {};
	function E(a, b, e) {
		this.props = a;
		this.context = b;
		this.refs = D;
		this.updater = e || B;
	}
	E.prototype.isReactComponent = {};
	E.prototype.setState = function(a, b) {
		if ("object" !== typeof a && "function" !== typeof a && null != a) throw Error("setState(...): takes an object of state variables to update or a function which returns an object of state variables.");
		this.updater.enqueueSetState(this, a, b, "setState");
	};
	E.prototype.forceUpdate = function(a) {
		this.updater.enqueueForceUpdate(this, a, "forceUpdate");
	};
	function F() {}
	F.prototype = E.prototype;
	function G(a, b, e) {
		this.props = a;
		this.context = b;
		this.refs = D;
		this.updater = e || B;
	}
	var H = G.prototype = new F();
	H.constructor = G;
	C(H, E.prototype);
	H.isPureReactComponent = true;
	var I = Array.isArray;
	var J = Object.prototype.hasOwnProperty;
	var K = { current: null };
	var L = {
		key: true,
		ref: true,
		__self: true,
		__source: true
	};
	function M(a, b, e) {
		var d, c = {}, k = null, h = null;
		if (null != b) for (d in void 0 !== b.ref && (h = b.ref), void 0 !== b.key && (k = "" + b.key), b) J.call(b, d) && !L.hasOwnProperty(d) && (c[d] = b[d]);
		var g = arguments.length - 2;
		if (1 === g) c.children = e;
		else if (1 < g) {
			for (var f = Array(g), m = 0; m < g; m++) f[m] = arguments[m + 2];
			c.children = f;
		}
		if (a && a.defaultProps) for (d in g = a.defaultProps, g) void 0 === c[d] && (c[d] = g[d]);
		return {
			$$typeof: l,
			type: a,
			key: k,
			ref: h,
			props: c,
			_owner: K.current
		};
	}
	function N(a, b) {
		return {
			$$typeof: l,
			type: a.type,
			key: b,
			ref: a.ref,
			props: a.props,
			_owner: a._owner
		};
	}
	function O(a) {
		return "object" === typeof a && null !== a && a.$$typeof === l;
	}
	function escape(a) {
		var b = {
			"=": "=0",
			":": "=2"
		};
		return "$" + a.replace(/[=:]/g, function(a2) {
			return b[a2];
		});
	}
	var P = /\/+/g;
	function Q(a, b) {
		return "object" === typeof a && null !== a && null != a.key ? escape("" + a.key) : b.toString(36);
	}
	function R(a, b, e, d, c) {
		var k = typeof a;
		if ("undefined" === k || "boolean" === k) a = null;
		var h = false;
		if (null === a) h = true;
		else switch (k) {
			case "string":
			case "number":
				h = true;
				break;
			case "object": switch (a.$$typeof) {
				case l:
				case n: h = true;
			}
		}
		if (h) return h = a, c = c(h), a = "" === d ? "." + Q(h, 0) : d, I(c) ? (e = "", null != a && (e = a.replace(P, "$&/") + "/"), R(c, b, e, "", function(a2) {
			return a2;
		})) : null != c && (O(c) && (c = N(c, e + (!c.key || h && h.key === c.key ? "" : ("" + c.key).replace(P, "$&/") + "/") + a)), b.push(c)), 1;
		h = 0;
		d = "" === d ? "." : d + ":";
		if (I(a)) for (var g = 0; g < a.length; g++) {
			k = a[g];
			var f = d + Q(k, g);
			h += R(k, b, e, f, c);
		}
		else if (f = A(a), "function" === typeof f) for (a = f.call(a), g = 0; !(k = a.next()).done;) k = k.value, f = d + Q(k, g++), h += R(k, b, e, f, c);
		else if ("object" === k) throw b = String(a), Error("Objects are not valid as a React child (found: " + ("[object Object]" === b ? "object with keys {" + Object.keys(a).join(", ") + "}" : b) + "). If you meant to render a collection of children, use an array instead.");
		return h;
	}
	function S(a, b, e) {
		if (null == a) return a;
		var d = [], c = 0;
		R(a, d, "", "", function(a2) {
			return b.call(e, a2, c++);
		});
		return d;
	}
	function T(a) {
		if (-1 === a._status) {
			var b = a._result;
			b = b();
			b.then(function(b2) {
				if (0 === a._status || -1 === a._status) a._status = 1, a._result = b2;
			}, function(b2) {
				if (0 === a._status || -1 === a._status) a._status = 2, a._result = b2;
			});
			-1 === a._status && (a._status = 0, a._result = b);
		}
		if (1 === a._status) return a._result.default;
		throw a._result;
	}
	var U = { current: null };
	var V = { transition: null };
	var W = {
		ReactCurrentDispatcher: U,
		ReactCurrentBatchConfig: V,
		ReactCurrentOwner: K
	};
	function X() {
		throw Error("act(...) is not supported in production builds of React.");
	}
	exports.Children = {
		map: S,
		forEach: function(a, b, e) {
			S(a, function() {
				b.apply(this, arguments);
			}, e);
		},
		count: function(a) {
			var b = 0;
			S(a, function() {
				b++;
			});
			return b;
		},
		toArray: function(a) {
			return S(a, function(a2) {
				return a2;
			}) || [];
		},
		only: function(a) {
			if (!O(a)) throw Error("React.Children.only expected to receive a single React element child.");
			return a;
		}
	};
	exports.Component = E;
	exports.Fragment = p;
	exports.Profiler = r;
	exports.PureComponent = G;
	exports.StrictMode = q;
	exports.Suspense = w;
	exports.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED = W;
	exports.act = X;
	exports.cloneElement = function(a, b, e) {
		if (null === a || void 0 === a) throw Error("React.cloneElement(...): The argument must be a React element, but you passed " + a + ".");
		var d = C({}, a.props), c = a.key, k = a.ref, h = a._owner;
		if (null != b) {
			void 0 !== b.ref && (k = b.ref, h = K.current);
			void 0 !== b.key && (c = "" + b.key);
			if (a.type && a.type.defaultProps) var g = a.type.defaultProps;
			for (f in b) J.call(b, f) && !L.hasOwnProperty(f) && (d[f] = void 0 === b[f] && void 0 !== g ? g[f] : b[f]);
		}
		var f = arguments.length - 2;
		if (1 === f) d.children = e;
		else if (1 < f) {
			g = Array(f);
			for (var m = 0; m < f; m++) g[m] = arguments[m + 2];
			d.children = g;
		}
		return {
			$$typeof: l,
			type: a.type,
			key: c,
			ref: k,
			props: d,
			_owner: h
		};
	};
	exports.createContext = function(a) {
		a = {
			$$typeof: u,
			_currentValue: a,
			_currentValue2: a,
			_threadCount: 0,
			Provider: null,
			Consumer: null,
			_defaultValue: null,
			_globalName: null
		};
		a.Provider = {
			$$typeof: t,
			_context: a
		};
		return a.Consumer = a;
	};
	exports.createElement = M;
	exports.createFactory = function(a) {
		var b = M.bind(null, a);
		b.type = a;
		return b;
	};
	exports.createRef = function() {
		return { current: null };
	};
	exports.forwardRef = function(a) {
		return {
			$$typeof: v,
			render: a
		};
	};
	exports.isValidElement = O;
	exports.lazy = function(a) {
		return {
			$$typeof: y,
			_payload: {
				_status: -1,
				_result: a
			},
			_init: T
		};
	};
	exports.memo = function(a, b) {
		return {
			$$typeof: x,
			type: a,
			compare: void 0 === b ? null : b
		};
	};
	exports.startTransition = function(a) {
		var b = V.transition;
		V.transition = {};
		try {
			a();
		} finally {
			V.transition = b;
		}
	};
	exports.unstable_act = X;
	exports.useCallback = function(a, b) {
		return U.current.useCallback(a, b);
	};
	exports.useContext = function(a) {
		return U.current.useContext(a);
	};
	exports.useDebugValue = function() {};
	exports.useDeferredValue = function(a) {
		return U.current.useDeferredValue(a);
	};
	exports.useEffect = function(a, b) {
		return U.current.useEffect(a, b);
	};
	exports.useId = function() {
		return U.current.useId();
	};
	exports.useImperativeHandle = function(a, b, e) {
		return U.current.useImperativeHandle(a, b, e);
	};
	exports.useInsertionEffect = function(a, b) {
		return U.current.useInsertionEffect(a, b);
	};
	exports.useLayoutEffect = function(a, b) {
		return U.current.useLayoutEffect(a, b);
	};
	exports.useMemo = function(a, b) {
		return U.current.useMemo(a, b);
	};
	exports.useReducer = function(a, b, e) {
		return U.current.useReducer(a, b, e);
	};
	exports.useRef = function(a) {
		return U.current.useRef(a);
	};
	exports.useState = function(a) {
		return U.current.useState(a);
	};
	exports.useSyncExternalStore = function(a, b, e) {
		return U.current.useSyncExternalStore(a, b, e);
	};
	exports.useTransition = function() {
		return U.current.useTransition();
	};
	exports.version = "18.3.1";
} });
var require_react = __commonJS({ "../../node_modules/react/index.js"(exports, module) {
	"use strict";
	module.exports = require_react_production_min();
} });
var dictionary_default = {
	arabic: { words: [
		"سكس",
		"طيز",
		"شرج",
		"لعق",
		"لحس",
		"تمص",
		"بيضان",
		"ثدي",
		"بز",
		"حلمة",
		"مفلقسة",
		"بظر",
		"كس",
		"مبادل",
		"عاهرة",
		"جماع",
		"قضيب",
		"زب",
		"لوطي",
		"لواط",
		"سحاق",
		"اغتصاب",
		"خنثي",
		"احتلام",
		"نيك",
		"متناك",
		"شرموطة",
		"عرص",
		"خول",
		"قحبة",
		"لبوة",
		"وسخ",
		"علق",
		"ناك",
		"منيك",
		"شرمط",
		"قحب",
		"شرموط",
		"خول",
		"هنيك",
		"فحل",
		"ديوث",
		"متناك",
		"هايج",
		"زبر",
		"bdsm",
		"زان",
		"سادي",
		"سادى",
		"كسها",
		"كسي",
		"كسك",
		"كسم",
		"بنتاك",
		"بتناك",
		"نيكني",
		"ديوث",
		"نياك",
		"فشاخ",
		"فشخ",
		"هفشخك",
		"شذوذ",
		"لواط",
		"لوطي",
		"لوطى",
		"عاهر",
		"لحس",
		"متع",
		"حمام",
		"هربط",
		"دياث",
		"سحاق",
		"جنس",
		"جنس",
		"جوزي",
		"مراتي",
		"مراتى",
		"مرات",
		"ورا",
		"شعر",
		"مشعر",
		"اركب",
		"فرس",
		"جاد",
		"منيوك",
		"زوبر",
		"طياز",
		"شراميط",
		"فاجر",
		"محروم",
		"واقف",
		"بيحك",
		"ممحونة",
		"لبن",
		"لبو",
		"واقف",
		"شرقان",
		"افضي",
		"دهولت",
		"bzaz",
		"nek",
		"nik",
		"mtnak",
		"zeb",
		"zep",
		"zobr",
		"zopr",
		"kos",
		"a7a",
		"hayg",
		"لبوه",
		"لبوة",
		"لبوت",
		"sharma",
		"banoty",
		"بنوتي",
		"بنوتى",
		"سلب",
		"عايز",
		"دكر",
		"نتاية",
		"نتايه",
		"زنج",
		"ممحون",
		"تعبان",
		"اقعد",
		"بزاز",
		"هيجان",
		"سافل",
		"مصيهولي",
		"هتمص",
		"مصي",
		"بز",
		"hayg",
		"كلوت",
		"اندر",
		"سنتيا",
		"بوكسر",
		"بتاع",
		"مشتهي",
		"زبى",
		"نكته",
		"اتناك",
		"nayak",
		"nyak",
		"neeek",
		"اغتصا",
		"زب",
		"كس",
		"بلكيشن",
		"كيشن",
		"ليسبيان",
		"سبيان"
	] }.words,
	chinese: { words: [
		"13.",
		"13点",
		"三级片",
		"下三烂",
		"下贱",
		"个老子的",
		"九游",
		"乳",
		"乳交",
		"乳头",
		"乳房",
		"乳波臀浪",
		"交配",
		"仆街",
		"他奶奶",
		"他奶奶的",
		"他奶娘的",
		"他妈",
		"他妈ㄉ王八蛋",
		"他妈地",
		"他妈的",
		"他娘",
		"他马的",
		"你个傻比",
		"你他马的",
		"你全家",
		"你奶奶的",
		"你她马的",
		"你妈",
		"你妈的",
		"你娘",
		"你娘卡好",
		"你娘咧",
		"你它妈的",
		"你它马的",
		"你是鸡",
		"你是鸭",
		"你马的",
		"做爱",
		"傻比",
		"傻逼",
		"册那",
		"军妓",
		"几八",
		"几叭",
		"几巴",
		"几芭",
		"刚度",
		"刚瘪三",
		"包皮",
		"十三点",
		"卖B",
		"卖比",
		"卖淫",
		"卵",
		"卵子",
		"双峰微颤",
		"口交",
		"口肯",
		"叫床",
		"吃屎",
		"后庭",
		"吹箫",
		"塞你公",
		"塞你娘",
		"塞你母",
		"塞你爸",
		"塞你老师",
		"塞你老母",
		"处女",
		"外阴",
		"大卵子",
		"大卵泡",
		"大鸡巴",
		"奶",
		"奶奶的熊",
		"奶子",
		"奸",
		"奸你",
		"她妈地",
		"她妈的",
		"她马的",
		"妈B",
		"妈个B",
		"妈个比",
		"妈个老比",
		"妈妈的",
		"妈比",
		"妈的",
		"妈的B",
		"妈逼",
		"妓",
		"妓女",
		"妓院",
		"妳她妈的",
		"妳妈的",
		"妳娘的",
		"妳老母的",
		"妳马的",
		"姘头",
		"姣西",
		"姦",
		"娘个比",
		"娘的",
		"婊子",
		"婊子养的",
		"嫖娼",
		"嫖客",
		"它妈地",
		"它妈的",
		"密洞",
		"射你",
		"射精",
		"小乳头",
		"小卵子",
		"小卵泡",
		"小瘪三",
		"小肉粒",
		"小骚比",
		"小骚货",
		"小鸡巴",
		"小鸡鸡",
		"屁眼",
		"屁股",
		"屄",
		"屌",
		"巨乳",
		"干x娘",
		"干七八",
		"干你",
		"干你妈",
		"干你娘",
		"干你老母",
		"干你良",
		"干妳妈",
		"干妳娘",
		"干妳老母",
		"干妳马",
		"干您娘",
		"干机掰",
		"干死CS",
		"干死GM",
		"干死你",
		"干死客服",
		"幹",
		"强奸",
		"强奸你",
		"性",
		"性交",
		"性器",
		"性无能",
		"性爱",
		"情色",
		"想上你",
		"懆您妈",
		"懆您娘",
		"懒8",
		"懒八",
		"懒叫",
		"懒教",
		"成人",
		"我操你祖宗十八代",
		"扒光",
		"打炮",
		"打飞机",
		"抽插",
		"招妓",
		"插你",
		"插死你",
		"撒尿",
		"操你",
		"操你全家",
		"操你奶奶",
		"操你妈",
		"操你娘",
		"操你祖宗",
		"操你老妈",
		"操你老母",
		"操妳",
		"操妳全家",
		"操妳妈",
		"操妳娘",
		"操妳祖宗",
		"操机掰",
		"操比",
		"操逼",
		"放荡",
		"日他娘",
		"日你",
		"日你妈",
		"日你老娘",
		"日你老母",
		"日批",
		"月经",
		"机八",
		"机巴",
		"机机歪歪",
		"杂种",
		"浪叫",
		"淫",
		"淫乱",
		"淫妇",
		"淫棍",
		"淫水",
		"淫秽",
		"淫荡",
		"淫西",
		"湿透的内裤",
		"激情",
		"灨你娘",
		"烂货",
		"烂逼",
		"爛",
		"狗屁",
		"狗日",
		"狗狼养的",
		"玉杵",
		"王八蛋",
		"瓜娃子",
		"瓜婆娘",
		"瓜批",
		"瘪三",
		"白烂",
		"白痴",
		"白癡",
		"祖宗",
		"私服",
		"笨蛋",
		"精子",
		"老二",
		"老味",
		"老母",
		"老瘪三",
		"老骚比",
		"老骚货",
		"肉壁",
		"肉棍子",
		"肉棒",
		"肉缝",
		"肏",
		"肛交",
		"肥西",
		"色情",
		"花柳",
		"荡妇",
		"賤",
		"贝肉",
		"贱B",
		"贱人",
		"贱货",
		"贼你妈",
		"赛你老母",
		"赛妳阿母",
		"赣您娘",
		"轮奸",
		"迷药",
		"逼",
		"逼样",
		"野鸡",
		"阳具",
		"阳萎",
		"阴唇",
		"阴户",
		"阴核",
		"阴毛",
		"阴茎",
		"阴道",
		"阴部",
		"雞巴",
		"靠北",
		"靠母",
		"靠爸",
		"靠背",
		"靠腰",
		"驶你公",
		"驶你娘",
		"驶你母",
		"驶你爸",
		"驶你老师",
		"驶你老母",
		"骚比",
		"骚货",
		"骚逼",
		"鬼公",
		"鸡8",
		"鸡八",
		"鸡叭",
		"鸡吧",
		"鸡奸",
		"鸡巴",
		"鸡芭",
		"鸡鸡",
		"龟儿子",
		"龟头"
	] }.words,
	czech: { words: [
		"bordel",
		"buzna",
		"čumět",
		"čurák",
		"debil",
		"do piče",
		"do prdele",
		"dršťka",
		"držka",
		"flundra",
		"hajzl",
		"hovno",
		"chcanky",
		"chuj",
		"jebat",
		"kokot",
		"kokotina",
		"koňomrd",
		"kunda",
		"kurva",
		"mamrd",
		"mrdat",
		"mrdka",
		"mrdník",
		"oslošoust",
		"piča",
		"píčus",
		"píchat",
		"pizda",
		"prcat",
		"prdel",
		"prdelka",
		"sračka",
		"srát",
		"šoustat",
		"šulin",
		"vypíčenec",
		"zkurvit",
		"zkurvysyn",
		"zmrd",
		"žrát"
	] }.words,
	danish: { words: [
		"anus",
		"bøsserøv",
		"cock",
		"fisse",
		"fissehår",
		"fuck",
		"hestepik",
		"kussekryller",
		"lort",
		"luder",
		"pik",
		"pikhår",
		"pikslugeri",
		"piksutteri",
		"pis",
		"røv",
		"røvhul",
		"røvskæg",
		"røvspræke",
		"shit"
	] }.words,
	english: { words: [
		"2 girls 1 cup",
		"2g1c",
		"a$$",
		"acrotomophilia",
		"alabama hot pocket",
		"alaskan pipeline",
		"anal",
		"anilingus",
		"anus",
		"apeshit",
		"arsehole",
		"ass",
		"asshat",
		"asshole",
		"assmunch",
		"asswipe",
		"auto erotic",
		"autoerotic",
		"b!tch",
		"babeland",
		"baby batter",
		"baby juice",
		"ball gag",
		"ball gravy",
		"ball kicking",
		"ball licking",
		"ball sack",
		"ball sucking",
		"bangbros",
		"bareback",
		"barely legal",
		"barenaked",
		"bastard",
		"bastardized",
		"bastardo",
		"bastinado",
		"bbw",
		"bdsm",
		"beaner",
		"beaners",
		"beaver cleaver",
		"beaver lips",
		"bestiality",
		"big black",
		"big breasts",
		"big knockers",
		"big tits",
		"bimbos",
		"birdlock",
		"bitch",
		"bitches",
		"black cock",
		"blonde action",
		"blonde on blonde action",
		"blow job",
		"blow your load",
		"blowjob",
		"blue waffle",
		"blumpkin",
		"bollocks",
		"bondage",
		"boner",
		"boob",
		"boobs",
		"booty call",
		"brown showers",
		"brunette action",
		"bs",
		"bukkake",
		"bulldyke",
		"bullet vibe",
		"bullshit",
		"bung hole",
		"bunghole",
		"busty",
		"butt",
		"buttcheeks",
		"butthole",
		"camel toe",
		"camgirl",
		"camslut",
		"camwhore",
		"carpet muncher",
		"carpetmuncher",
		"chocolate rosebuds",
		"circlejerk",
		"cleveland steamer",
		"clit",
		"clitoris",
		"clover clamps",
		"clusterfuck",
		"cock",
		"cocks",
		"cocksucker",
		"coon",
		"coons",
		"coprolagnia",
		"coprophilia",
		"cornhole",
		"creampie",
		"cum",
		"cumming",
		"cunnilingus",
		"cunt",
		"darkie",
		"date rape",
		"daterape",
		"deep throat",
		"deepthroat",
		"dendrophilia",
		"dick",
		"dildo",
		"dingleberries",
		"dingleberry",
		"dipshit",
		"dirty pillows",
		"dirty sanchez",
		"dog style",
		"doggie style",
		"doggiestyle",
		"doggy style",
		"doggystyle",
		"dolcett",
		"domination",
		"dominatrix",
		"dommes",
		"donkey punch",
		"double dong",
		"double penetration",
		"dp action",
		"dry hump",
		"dumbass",
		"dvda",
		"eat my ass",
		"ecchi",
		"ejaculation",
		"erotic",
		"erotism",
		"escort",
		"eunuch",
		"f*ck",
		"f@ck",
		"faggot",
		"fecal",
		"felch",
		"fellatio",
		"feltch",
		"female squirting",
		"femdom",
		"figging",
		"fingerbang",
		"fingering",
		"fisting",
		"foot fetish",
		"footjob",
		"frotting",
		"fuck",
		"fuck buttons",
		"fucker",
		"fuckface",
		"fuckin",
		"fucking",
		"fucktards",
		"fudge packer",
		"fudgepacker",
		"fuq",
		"futanari",
		"g-spot",
		"gang bang",
		"gay sex",
		"genitals",
		"giant cock",
		"girl on",
		"girl on top",
		"girls gone wild",
		"goatcx",
		"goatse",
		"god damn",
		"gokkun",
		"golden shower",
		"goo girl",
		"goodpoop",
		"goregasm",
		"grope",
		"group sex",
		"guro",
		"hand job",
		"handjob",
		"hard core",
		"hardcore",
		"hentai",
		"hoe",
		"homoerotic",
		"honkey",
		"hooker",
		"hot carl",
		"hot chick",
		"how to kill",
		"how to murder",
		"huge fat",
		"humping",
		"incest",
		"intercourse",
		"jack off",
		"jackass",
		"jail bait",
		"jailbait",
		"jelly donut",
		"jerk off",
		"jigaboo",
		"jiggaboo",
		"jiggerboo",
		"jizz",
		"juggs",
		"kike",
		"kinbaku",
		"kinkster",
		"kinky",
		"knobbing",
		"leather restraint",
		"leather straight jacket",
		"lemon party",
		"lmfao",
		"lolita",
		"lovemaking",
		"make me come",
		"male squirting",
		"masturbate",
		"menage a trois",
		"mf",
		"milf",
		"missionary position",
		"motherfucker",
		"mound of venus",
		"mr hands",
		"muff diver",
		"muffdiving",
		"nambla",
		"nawashi",
		"negro",
		"neonazi",
		"nig nog",
		"nigga",
		"nigger",
		"nimphomania",
		"nipple",
		"nipples",
		"nsfw images",
		"nude",
		"nudity",
		"nympho",
		"nymphomania",
		"octopussy",
		"omfg",
		"omorashi",
		"one cup two girls",
		"one guy one jar",
		"orgasm",
		"orgy",
		"paedophile",
		"paki",
		"panties",
		"panty",
		"pedobear",
		"pedophile",
		"pegging",
		"penis",
		"phone sex",
		"piece of shit",
		"piss pig",
		"pissed",
		"pissing",
		"pisspig",
		"playboy",
		"pleasure chest",
		"pole smoker",
		"ponyplay",
		"poof",
		"poon",
		"poontang",
		"poop chute",
		"poopchute",
		"porn",
		"porno",
		"pornography",
		"prince albert piercing",
		"pthc",
		"pubes",
		"punany",
		"pussy",
		"queaf",
		"queef",
		"quim",
		"raghead",
		"raging boner",
		"rape",
		"raping",
		"rapist",
		"rectum",
		"retard",
		"retarded",
		"reverse cowgirl",
		"rimjob",
		"rimming",
		"rosy palm",
		"rosy palm and her 5 sisters",
		"rusty trombone",
		"s&m",
		"sadism",
		"santorum",
		"scat",
		"schlong",
		"scissoring",
		"semen",
		"sex",
		"sexo",
		"sexy",
		"sh!t",
		"shaved beaver",
		"shaved pussy",
		"shemale",
		"shibari",
		"shit",
		"shitblimp",
		"shithead",
		"shitshow",
		"shitty",
		"shota",
		"shrimping",
		"simp",
		"skeet",
		"slanteye",
		"slut",
		"smut",
		"snatch",
		"snowballing",
		"sodomize",
		"sodomy",
		"spic",
		"splooge",
		"splooge moose",
		"spooge",
		"spread legs",
		"spunk",
		"stfu",
		"strap on",
		"strapon",
		"strappado",
		"strip club",
		"style doggy",
		"suck",
		"sucks",
		"suicide girls",
		"sultry women",
		"swastika",
		"swinger",
		"tainted love",
		"taste my",
		"tea bagging",
		"testbad01",
		"threesome",
		"throating",
		"tied up",
		"tight white",
		"tit",
		"tits",
		"titties",
		"titty",
		"tongue in a",
		"topless",
		"tosser",
		"towelhead",
		"tranny",
		"tribadism",
		"tub girl",
		"tubgirl",
		"tushy",
		"twat",
		"twink",
		"twinkie",
		"two girls one cup",
		"undressing",
		"upskirt",
		"urethra play",
		"urophilia",
		"vagina",
		"venus mound",
		"vibrator",
		"violet wand",
		"vorarephilia",
		"voyeur",
		"vulva",
		"wank",
		"wet dream",
		"wetback",
		"white power",
		"wrapping men",
		"wrinkled starfish",
		"wtf",
		"xx",
		"xxx",
		"yaoi",
		"yellow showers",
		"yiffy",
		"zoophilia",
		"🖕"
	] }.words,
	esperanto: { words: [
		"bugren",
		"bugri",
		"bugru",
		"ĉiesulino",
		"ĉiesulo",
		"diofek",
		"diofeka",
		"fek",
		"feken",
		"fekfikanto",
		"feklekulo",
		"fekulo",
		"fik",
		"fikado",
		"fikema",
		"fikfek",
		"fiki",
		"fikiĝi",
		"fikiĝu",
		"fikilo",
		"fikklaŭno",
		"fikota",
		"fiku",
		"forfiki",
		"forfikiĝu",
		"forfiku",
		"forfurzu",
		"forpisi",
		"forpisu",
		"furzulo",
		"kacen",
		"kaco",
		"kacsuĉulo",
		"kojono",
		"piĉen",
		"piĉo",
		"zamenfek"
	] }.words,
	finnish: { words: [
		"alfred nussi",
		"bylsiä",
		"haahka",
		"haista paska",
		"haista vittu",
		"hatullinen",
		"helvetisti",
		"hevonkuusi",
		"hevonpaska",
		"hevonperse",
		"hevonvittu",
		"hevonvitunperse",
		"hitosti",
		"hitto",
		"huorata",
		"hässiä",
		"juosten kustu",
		"jutku",
		"jutsku",
		"jätkä",
		"kananpaska",
		"koiranpaska",
		"kuin esterin perseestä",
		"kulli",
		"kullinluikaus",
		"kuppainen",
		"kusaista",
		"kuseksia",
		"kusettaa",
		"kusi",
		"kusipää",
		"kusta",
		"kyrpiintynyt",
		"kyrpiintyä",
		"kyrpiä",
		"kyrpä",
		"kyrpänaama",
		"kyrvitys",
		"lahtari",
		"lutka",
		"molo",
		"molopää",
		"mulkero",
		"mulkku",
		"mulkvisti",
		"muna",
		"munapää",
		"munaton",
		"mutakuono",
		"mutiainen",
		"naida",
		"nainti",
		"narttu",
		"neekeri",
		"nekru",
		"nuolla persettä",
		"nussia",
		"nussija",
		"nussinta",
		"paljaalla",
		"palli",
		"pallit",
		"paneskella",
		"panettaa",
		"panna",
		"pano",
		"pantava",
		"paska",
		"paskainen",
		"paskamainen",
		"paskanmarjat",
		"paskantaa",
		"paskapuhe",
		"paskapää",
		"paskattaa",
		"paskiainen",
		"paskoa",
		"pehko",
		"pentele",
		"perkele",
		"perkeleesti",
		"persaukinen",
		"perse",
		"perseennuolija",
		"perseet olalla",
		"persereikä",
		"perseääliö",
		"persläpi",
		"perspano",
		"persvako",
		"pilkunnussija",
		"pillu",
		"pillut",
		"pipari",
		"piru",
		"pistää",
		"pyllyvako",
		"reikä",
		"reva",
		"ripsipiirakka",
		"runkata",
		"runkkari",
		"runkkaus",
		"runkku",
		"ryssä",
		"rättipää",
		"saatanasti",
		"suklaaosasto",
		"tavara",
		"toosa",
		"tuhkaluukku",
		"tumputtaa",
		"turpasauna",
		"tussu",
		"tussukka",
		"tussut",
		"vakipano",
		"vetää käteen",
		"viiksi",
		"vittu",
		"vittuilla",
		"vittuilu",
		"vittumainen",
		"vittuuntua",
		"vittuuntunut",
		"vitun",
		"vitusti",
		"vituttaa",
		"vitutus",
		"äpärä"
	] }.words,
	french: { words: [
		"baiser",
		"bander",
		"bigornette",
		"bite",
		"bitte",
		"bloblos",
		"bordel",
		"bosser",
		"bourré",
		"bourrée",
		"brackmard",
		"branlage",
		"branler",
		"branlette",
		"branleur",
		"branleuse",
		"brouter le cresson",
		"caca",
		"cailler",
		"chatte",
		"chiasse",
		"chier",
		"chiottes",
		"clito",
		"clitoris",
		"con",
		"connard",
		"connasse",
		"conne",
		"couilles",
		"cramouille",
		"cul",
		"déconne",
		"déconner",
		"drague",
		"emmerdant",
		"emmerder",
		"emmerdeur",
		"emmerdeuse",
		"enculé",
		"enculée",
		"enculeur",
		"enculeurs",
		"enfoiré",
		"enfoirée",
		"étron",
		"fille de pute",
		"fils de pute",
		"folle",
		"foutre",
		"gerbe",
		"gerber",
		"gouine",
		"grande folle",
		"grogniasse",
		"gueule",
		"jouir",
		"la putain de ta mère",
		"MALPT",
		"ménage à trois",
		"merde",
		"merdeuse",
		"merdeux",
		"meuf",
		"nègre",
		"nique ta mère",
		"nique ta race",
		"palucher",
		"pédale",
		"pédé",
		"péter",
		"pipi",
		"pisser",
		"pouffiasse",
		"pousse-crotte",
		"putain",
		"pute",
		"ramoner",
		"sac à foutre",
		"sac à merde",
		"salaud",
		"salope",
		"suce",
		"tapette",
		"tanche",
		"teuch",
		"teuf",
		"tringler",
		"trique",
		"troncher",
		"trou du cul",
		"turlute",
		"veuve",
		"zigounette",
		"zizi"
	] }.words,
	german: { words: [
		"analritter",
		"arsch",
		"arschficker",
		"arschlecker",
		"arschloch",
		"bimbo",
		"bratze",
		"bumsen",
		"bonze",
		"dödel",
		"fick",
		"ficken",
		"flittchen",
		"fotze",
		"fratze",
		"hackfresse",
		"hure",
		"hurensohn",
		"ische",
		"kackbratze",
		"kacke",
		"kacken",
		"kackwurst",
		"kampflesbe",
		"kanake",
		"kimme",
		"lümmel",
		"MILF",
		"möpse",
		"morgenlatte",
		"möse",
		"mufti",
		"muschi",
		"nackt",
		"neger",
		"nigger",
		"nippel",
		"nutte",
		"onanieren",
		"orgasmus",
		"pimmel",
		"pimpern",
		"pinkeln",
		"pissen",
		"pisser",
		"popel",
		"poppen",
		"porno",
		"reudig",
		"rosette",
		"schabracke",
		"schlampe",
		"scheiße",
		"scheisser",
		"schiesser",
		"schnackeln",
		"schwanzlutscher",
		"schwuchtel",
		"tittchen",
		"titten",
		"vögeln",
		"vollpfosten",
		"wichse",
		"wichsen",
		"wichser"
	] }.words,
	hindi: { words: [
		"aand",
		"aandu",
		"balatkar",
		"beti chod",
		"bhadva",
		"bhadve",
		"bhandve",
		"bhootni ke",
		"bhosad",
		"bhosadi ke",
		"boobe",
		"chakke",
		"chinaal",
		"chinki",
		"chod",
		"chodu",
		"chodu bhagat",
		"chooche",
		"choochi",
		"choot",
		"choot ke baal",
		"chootia",
		"chootiya",
		"chuche",
		"chuchi",
		"chudai khanaa",
		"chudan chudai",
		"chut",
		"chut ke baal",
		"chut ke dhakkan",
		"chut maarli",
		"chutad",
		"chutadd",
		"chutan",
		"chutia",
		"chutiya",
		"gaand",
		"gaandfat",
		"gaandmasti",
		"gaandufad",
		"gandu",
		"gashti",
		"gasti",
		"ghassa",
		"ghasti",
		"harami",
		"haramzade",
		"hawas",
		"hawas ke pujari",
		"hijda",
		"hijra",
		"jhant",
		"jhant chaatu",
		"jhant ke baal",
		"jhantu",
		"kamine",
		"kaminey",
		"kanjar",
		"kutta",
		"kutta kamina",
		"kutte ki aulad",
		"kutte ki jat",
		"kuttiya",
		"loda",
		"lodu",
		"lund",
		"lund choos",
		"lund khajoor",
		"lundtopi",
		"lundure",
		"maa ki chut",
		"maal",
		"madar chod",
		"mooh mein le",
		"mutth",
		"najayaz",
		"najayaz aulaad",
		"najayaz paidaish",
		"paki",
		"pataka",
		"patakha",
		"raand",
		"randi",
		"saala",
		"saala kutta",
		"saali kutti",
		"saali randi",
		"suar",
		"suar ki aulad",
		"tatte",
		"tatti",
		"teri maa ka bhosada",
		"teri maa ka boba chusu",
		"teri maa ki chut",
		"tharak",
		"tharki"
	] }.words,
	hungarian: { words: [
		"balfasz",
		"balfaszok",
		"balfaszokat",
		"balfaszt",
		"barmok",
		"barmokat",
		"barmot",
		"barom",
		"baszik",
		"bazmeg",
		"buksza",
		"bukszák",
		"bukszákat",
		"bukszát",
		"búr",
		"búrok",
		"csöcs",
		"csöcsök",
		"csöcsöket",
		"csöcsöt",
		"fasz",
		"faszfej",
		"faszfejek",
		"faszfejeket",
		"faszfejet",
		"faszok",
		"faszokat",
		"faszt",
		"fing",
		"fingok",
		"fingokat",
		"fingot",
		"franc",
		"francok",
		"francokat",
		"francot",
		"geci",
		"gecibb",
		"gecik",
		"geciket",
		"gecit",
		"kibaszott",
		"kibaszottabb",
		"kúr",
		"kurafi",
		"kurafik",
		"kurafikat",
		"kurafit",
		"kurva",
		"kurvák",
		"kurvákat",
		"kurvát",
		"leggecibb",
		"legkibaszottabb",
		"legszarabb",
		"marha",
		"marhák",
		"marhákat",
		"marhát",
		"megdöglik",
		"pele",
		"pelék",
		"picsa",
		"picsákat",
		"picsát",
		"pina",
		"pinák",
		"pinákat",
		"pinát",
		"pofa",
		"pofákat",
		"pofát",
		"pöcs",
		"pöcsök",
		"pöcsöket",
		"pöcsöt",
		"punci",
		"puncik",
		"segg",
		"seggek",
		"seggeket",
		"segget",
		"seggfej",
		"seggfejek",
		"seggfejeket",
		"seggfejet",
		"szajha",
		"szajhák",
		"szajhákat",
		"szajhát",
		"szar",
		"szarabb",
		"szarik",
		"szarok",
		"szarokat",
		"szart"
	] }.words,
	italian: { words: [
		"allupato",
		"ammucchiata",
		"anale",
		"arrapato",
		"arrusa",
		"arruso",
		"assatanato",
		"bagascia",
		"bagassa",
		"bagnarsi",
		"baldracca",
		"balle",
		"battere",
		"battona",
		"belino",
		"biga",
		"bocchinara",
		"bocchino",
		"bofilo",
		"boiata",
		"bordello",
		"brinca",
		"bucaiolo",
		"budiùlo",
		"buona donna",
		"busone",
		"cacca",
		"caccati in mano e prenditi a schiaffi",
		"caciocappella",
		"cadavere",
		"cagare",
		"cagata",
		"cagna",
		"cammello",
		"cappella",
		"carciofo",
		"carità",
		"casci",
		"cazzata",
		"cazzimma",
		"cazzo",
		"checca",
		"chiappa",
		"chiavare",
		"chiavata",
		"ciospo",
		"ciucciami il cazzo",
		"coglione",
		"coglioni",
		"cornuto",
		"cozza",
		"culattina",
		"culattone",
		"culo",
		"di merda",
		"ditalino",
		"duro",
		"fare unaŠ",
		"fava",
		"femminuccia",
		"fica",
		"figa",
		"figlio di buona donna",
		"figlio di puttana",
		"figone",
		"finocchio",
		"fottere",
		"fottersi",
		"fracicone",
		"fregna",
		"frocio",
		"froscio",
		"fuori come un balcone",
		"goldone",
		"grilletto",
		"guanto",
		"guardone",
		"incazzarsi",
		"incoglionirsi",
		"ingoio",
		"l'arte bolognese",
		"leccaculo",
		"lecchino",
		"lofare",
		"loffa",
		"loffare",
		"lumaca",
		"manico",
		"mannaggia",
		"merda",
		"merdata",
		"merdoso",
		"mignotta",
		"minchia",
		"minchione",
		"mona",
		"monta",
		"montare",
		"mussa",
		"nave scuola",
		"nerchia",
		"nudo",
		"padulo",
		"palle",
		"palloso",
		"patacca",
		"patonza",
		"pecorina",
		"pesce",
		"picio",
		"pincare",
		"pipa",
		"pipì",
		"pippone",
		"pirla",
		"pisciare",
		"piscio",
		"pisello",
		"pistola",
		"pistolotto",
		"pomiciare",
		"pompa",
		"pompino",
		"porca",
		"porca madonna",
		"porca miseria",
		"porca puttana",
		"porco due",
		"porco zio",
		"potta",
		"puppami",
		"puttana",
		"quaglia",
		"recchione",
		"regina",
		"rincoglionire",
		"rizzarsi",
		"rompiballe",
		"ruffiano",
		"sbattere",
		"sbattersi",
		"sborra",
		"sborrata",
		"sborrone",
		"sbrodolata",
		"scopare",
		"scopata",
		"scorreggiare",
		"sega",
		"slinguare",
		"slinguata",
		"smandrappata",
		"soccia",
		"socmel",
		"sorca",
		"spagnola",
		"spompinare",
		"sticchio",
		"stronza",
		"stronzata",
		"stronzo",
		"succhiami",
		"sveltina",
		"sverginare",
		"tarzanello",
		"terrone",
		"testa di cazzo",
		"tette",
		"tirare",
		"topa",
		"troia",
		"trombare",
		"uccello",
		"vacca",
		"vaffanculo",
		"vangare",
		"venire",
		"zinne",
		"zio cantante",
		"zoccola"
	] }.words,
	japanese: { words: [
		"3p",
		"g スポット",
		"s ＆ m",
		"sm",
		"sm女王",
		"xx",
		"アジアのかわいい女の子",
		"アスホール",
		"アナリングス",
		"アナル",
		"いたずら",
		"イラマチオ",
		"ウェブカメラ",
		"エクスタシー",
		"エスコート",
		"エッチ",
		"エロティズム",
		"エロティック",
		"オーガズム",
		"オカマ",
		"おしっこ",
		"おしり",
		"オシリ",
		"おしりのあな",
		"おっぱい",
		"オッパイ",
		"オナニー",
		"オマンコ",
		"おもらし",
		"お尻",
		"カーマスートラ",
		"カント",
		"クリトリス",
		"グループ・セックス",
		"グロ",
		"クンニリングス",
		"ゲイ・セックス",
		"ゲイの男性",
		"ゲイボーイ",
		"ゴールデンシャワー",
		"コカイン",
		"ゴックン",
		"サディズム",
		"しばり",
		"スウィンガー",
		"スカートの中",
		"スカトロ",
		"ストラップオン",
		"ストリップ劇場",
		"スラット",
		"スリット",
		"セクシーな",
		"セクシーな 10 代",
		"セックス",
		"ソドミー",
		"ちんこ",
		"ディープ・スロート",
		"ディック",
		"ディルド",
		"デートレイプ",
		"デブ",
		"テレフォンセックス",
		"ドッグスタイル",
		"トップレス",
		"なめ",
		"ニガー",
		"ヌード",
		"ネオ・ナチ",
		"ハードコア",
		"パイパン",
		"バイブレーター",
		"バック・スタイル",
		"パンティー",
		"ビッチ",
		"ファック",
		"ファンタジー",
		"フィスト",
		"フェティッシュ",
		"フェラチオ",
		"ふたなり",
		"ぶっかけ",
		"フック",
		"プリンス アルバート ピアス",
		"プレイボーイ",
		"ベアバック",
		"ペニス",
		"ペニスバンド",
		"ボーイズラブ",
		"ボールギャグ",
		"ボールを蹴る",
		"ぽっちゃり",
		"ホモ",
		"ポルノ",
		"ポルノグラフィー",
		"ボンテージ",
		"マザー・ファッカー",
		"マスターベーション",
		"まんこ",
		"やおい",
		"やりまん",
		"ユダヤ人",
		"ラティーナ",
		"ラバー",
		"ランジェリー",
		"レイプ",
		"レズビアン",
		"ローター",
		"ロリータ",
		"淫乱",
		"陰毛",
		"革抑制",
		"騎上位",
		"巨根",
		"巨乳",
		"強姦犯",
		"玉なめ",
		"玉舐め",
		"緊縛",
		"近親相姦",
		"嫌い",
		"後背位",
		"合意の性交",
		"拷問",
		"殺し方",
		"殺人事件",
		"殺人方法",
		"支配",
		"児童性虐待",
		"自己愛性",
		"射精",
		"手コキ",
		"獣姦",
		"女の子",
		"女王様",
		"女子高生",
		"女装",
		"新しいポルノ",
		"人妻",
		"人種",
		"性交",
		"正常位",
		"生殖器",
		"精液",
		"挿入",
		"足フェチ",
		"足を広げる",
		"大陰唇",
		"脱衣",
		"茶色のシャワー",
		"中出し",
		"潮吹き女",
		"潮吹き男性",
		"直腸",
		"剃毛",
		"貞操帯",
		"奴隷",
		"二穴",
		"乳首",
		"尿道プレイ",
		"覗き",
		"売春婦",
		"縛り",
		"噴出",
		"糞",
		"糞尿愛好症",
		"糞便",
		"平手打ち",
		"変態",
		"勃起する",
		"夢精",
		"毛深い",
		"誘惑",
		"幼児",
		"幼児性愛者",
		"裸",
		"裸の女性",
		"乱交",
		"両性",
		"両性具有",
		"両刀",
		"輪姦",
		"卍",
		"宦官",
		"肛門",
		"膣"
	] }.words,
	korean: { words: [
		"강간",
		"개새끼",
		"개자식",
		"개좆",
		"개차반",
		"거유",
		"계집년",
		"고자",
		"근친",
		"노모",
		"니기미",
		"뒤질래",
		"딸딸이",
		"때씹",
		"또라이",
		"뙤놈",
		"로리타",
		"망가",
		"몰카",
		"미친",
		"미친새끼",
		"바바리맨",
		"변태",
		"병신",
		"보지",
		"불알",
		"빠구리",
		"사까시",
		"섹스",
		"스와핑",
		"쌍놈",
		"씨발",
		"씨발놈",
		"씨팔",
		"씹",
		"씹물",
		"씹빨",
		"씹새끼",
		"씹알",
		"씹창",
		"씹팔",
		"암캐",
		"애자",
		"야동",
		"야사",
		"야애니",
		"엄창",
		"에로",
		"염병",
		"옘병",
		"유모",
		"육갑",
		"은꼴",
		"자위",
		"자지",
		"잡년",
		"종간나",
		"좆",
		"좆만",
		"죽일년",
		"쥐좆",
		"직촬",
		"짱깨",
		"쪽바리",
		"창녀",
		"포르노",
		"하드코어",
		"호로",
		"화냥년",
		"후레아들",
		"후장",
		"희쭈그리"
	] }.words,
	norwegian: { words: [
		"drittsekk",
		"faen i helvete",
		"fitte",
		"jævla",
		"kuk",
		"kukene",
		"kuker",
		"nigger",
		"pikk",
		"sotrør",
		"ståpikk",
		"ståpikkene",
		"ståpikker"
	] }.words,
	persian: { words: [
		"آب کیر",
		"ارگاسم",
		"برهنه",
		"پورن",
		"پورنو",
		"تجاوز",
		"تخمی",
		"جق",
		"جقی",
		"جلق",
		"جنده",
		"چوچول",
		"حشر",
		"حشری",
		"داف",
		"دودول",
		"ساک زدن",
		"سکس",
		"سکس کردن",
		"سکسی",
		"سوپر",
		"شق کردن",
		"شهوت",
		"شهوتی",
		"شونبول",
		"فیلم سوپر",
		"کس",
		"کس دادن",
		"کس کردن",
		"کسکش",
		"کوس",
		"کون",
		"کون دادن",
		"کون کردن",
		"کونکش",
		"کونی",
		"کیر",
		"کیری",
		"لاپا",
		"لاپایی",
		"لاشی",
		"لخت",
		"لش",
		"منی",
		"هرزه"
	] }.words,
	polish: { words: [
		"burdel",
		"burdelmama",
		"chuj",
		"chujnia",
		"ciota",
		"cipa",
		"cyc",
		"debil",
		"dmuchać",
		"do kurwy nędzy",
		"dupa",
		"dupek",
		"duperele",
		"dziwka",
		"fiut",
		"gówno",
		"gówno prawda",
		"huj",
		"jajco",
		"jajeczko",
		"jajko",
		"jajo",
		"ja pierdolę",
		"jebać",
		"jebany",
		"kurwa",
		"kurwy",
		"kutafon",
		"kutas",
		"lizać pałę",
		"obciągać chuja",
		"obciągać fiuta",
		"obciągać loda",
		"pieprzyć",
		"pierdolec",
		"pierdolić",
		"pierdolnięty",
		"pierdoła",
		"pierdzieć",
		"pizda",
		"pojeb",
		"popierdolony",
		"robic loda",
		"robić loda",
		"ruchać",
		"rzygać",
		"skurwysyn",
		"sraczka",
		"srać",
		"suka",
		"syf",
		"wkurwiać",
		"zajebisty"
	] }.words,
	portuguese: { words: [
		"aborto",
		"amador",
		"ânus",
		"aranha",
		"ariano",
		"balalao",
		"bastardo",
		"bicha",
		"biscate",
		"bissexual",
		"boceta",
		"boob",
		"bosta",
		"braulio de borracha",
		"bumbum",
		"burro",
		"cabrao",
		"cacete",
		"cagar",
		"camisinha",
		"caralho",
		"cerveja",
		"chochota",
		"chupar",
		"clitoris",
		"cocaína",
		"colhoes",
		"comer",
		"cona",
		"consolo",
		"corno",
		"cu",
		"dar o rabo",
		"dum raio",
		"esporra",
		"fecal",
		"filho da puta",
		"foda",
		"foda-se",
		"foder",
		"frango assado",
		"gozar",
		"grelho",
		"heroína",
		"heterosexual",
		"homem gay",
		"homoerótico",
		"homosexual",
		"inferno",
		"lésbica",
		"lolita",
		"mama",
		"merda",
		"paneleiro",
		"passar um cheque",
		"pau",
		"peidar",
		"pênis",
		"pinto",
		"porra",
		"puta",
		"puta que pariu",
		"puta que te pariu",
		"queca",
		"sacanagem",
		"saco",
		"torneira",
		"transar",
		"vai-te foder",
		"vai tomar no cu",
		"veado",
		"vibrador",
		"xana",
		"xochota"
	] }.words,
	russian: { words: [
		"bychara",
		"byk",
		"chernozhopyi",
		"dolboy'eb",
		"ebalnik",
		"ebalo",
		"ebalom sch'elkat",
		"gol",
		"mudack",
		"opizdenet",
		"osto'eblo",
		"ostokhuitel'no",
		"ot'ebis",
		"otmudohat",
		"otpizdit",
		"otsosi",
		"padlo",
		"pedik",
		"perdet",
		"petuh",
		"pidar gnoinyj",
		"pizda",
		"pizdato",
		"pizdatyi",
		"piz'det",
		"pizdetc",
		"pizdoi nakryt'sja",
		"pizd'uk",
		"piz`dyulina",
		"podi ku'evo",
		"poeben",
		"po'imat' na konchik",
		"po'iti posrat",
		"po khuy",
		"poluchit pizdy",
		"pososi moyu konfetku",
		"prissat",
		"proebat",
		"promudobl'adsksya pizdopro'ebina",
		"propezdoloch",
		"prosrat",
		"raspeezdeyi",
		"raspizdatyi",
		"raz'yebuy",
		"raz'yoba",
		"s'ebat'sya",
		"shalava",
		"styervo",
		"sukin syn",
		"svodit posrat",
		"svoloch",
		"trakhat'sya",
		"trimandoblydskiy pizdoproyob",
		"ubl'yudok",
		"uboy",
		"u'ebitsche",
		"vafl'a",
		"vafli lovit",
		"v pizdu",
		"vyperdysh",
		"vzdrochennyi",
		"yeb vas",
		"za'ebat",
		"zaebis",
		"zalupa",
		"zalupat",
		"zasranetc",
		"zassat",
		"zlo'ebuchy",
		"бардак",
		"бздёнок",
		"блядки",
		"блядовать",
		"блядство",
		"блядь",
		"бугор",
		"во пизду",
		"встать раком",
		"выёбываться",
		"гандон",
		"говно",
		"говнюк",
		"голый",
		"дать пизды",
		"дерьмо",
		"дрочить",
		"другой дразнится",
		"ёбарь",
		"ебать",
		"ебать-копать",
		"ебло",
		"ебнуть",
		"ёб твою мать",
		"жопа",
		"жополиз",
		"играть на кожаной флейте",
		"измудохать",
		"каждый дрочит как он хочет",
		"какая разница",
		"как два пальца обоссать",
		"курите мою трубку",
		"лысого в кулаке гонять",
		"малофя",
		"манда",
		"мандавошка",
		"мент",
		"муда",
		"мудило",
		"мудозмон",
		"наебать",
		"наебениться",
		"наебнуться",
		"на фиг",
		"на хуй",
		"на хую вертеть",
		"на хуя",
		"нахуячиться",
		"невебенный",
		"не ебет",
		"ни за хуй собачу",
		"ни хуя",
		"обнаженный",
		"обоссаться можно",
		"один ебётся",
		"опесдол",
		"офигеть",
		"охуеть",
		"охуйтельно",
		"половое сношение",
		"секс",
		"сиски",
		"спиздить",
		"срать",
		"ссать",
		"траxать",
		"ты мне ваньку не валяй",
		"фига",
		"хапать",
		"хер с ней",
		"хер с ним",
		"хохол",
		"хрен",
		"хуёво",
		"хуёвый",
		"хуем груши околачивать",
		"хуеплет",
		"хуило",
		"хуиней страдать",
		"хуиня",
		"хуй",
		"хуйнуть",
		"хуй пинать"
	] }.words,
	spanish: { words: [
		"sesinato",
		"asno",
		"bastardo",
		"Bollera",
		"Cabron",
		"Cabrón",
		"Caca",
		"Chupada",
		"Chupapollas",
		"Chupetón",
		"concha",
		"Concha de tu madre",
		"Coño",
		"Coprofagía",
		"Culo",
		"Drogas",
		"Esperma",
		"Fiesta de salchichas",
		"Follador",
		"Follar",
		"Gilipichis",
		"Gilipollas",
		"Hacer una paja",
		"Haciendo el amor",
		"Heroína",
		"Hija de puta",
		"Hijaputa",
		"Hijo de puta",
		"Hijoputa",
		"Idiota",
		"Imbécil",
		"infierno",
		"Jilipollas",
		"Kapullo",
		"Lameculos",
		"Maciza",
		"Macizorra",
		"maldito",
		"Mamada",
		"Marica",
		"Maricón",
		"Mariconazo",
		"martillo",
		"Mierda",
		"Nazi",
		"Orina",
		"Pedo",
		"Pervertido",
		"Pezón",
		"Pinche",
		"Pis",
		"Prostituta",
		"Puta",
		"Racista",
		"Ramera",
		"Sádico",
		"Semen",
		"Sexo",
		"Sexo oral",
		"Soplagaitas",
		"Soplapollas",
		"Tetas grandes",
		"Tía buena",
		"Travesti",
		"Trio",
		"Verga",
		"vete a la mierda",
		"Vulva"
	] }.words,
	turkish: { words: [
		"aardappels afgieteng",
		"achter het raam zitten",
		"afberen",
		"aflebberen",
		"afrossen",
		"afrukken",
		"aftrekken",
		"afwerkplaats",
		"afzeiken",
		"afzuigen",
		"anderhalve man en een paardekop",
		"anita",
		"asbak",
		"aso",
		"bagger schijten",
		"balen",
		"bedonderen",
		"befborstelg",
		"beffen",
		"bekken",
		"belazeren",
		"besodemieterd zijn",
		"besodemieteren",
		"beurt",
		"boemelen",
		"boerelul",
		"boerenpummelg",
		"bokkelul",
		"botergeil",
		"broekhoesten",
		"brugpieperg",
		"buffelen",
		"buiten de pot piesen",
		"da's kloten van de bok",
		"de ballen",
		"de hoer spelen",
		"de hond uitlaten",
		"de koffer induiken",
		"delg",
		"de pijp aan maarten geven",
		"de pijp uitgaan",
		"dombo",
		"draaikontg",
		"driehoog achter wonen",
		"drolg",
		"drooggeiler",
		"droogkloot",
		"een beurt geven",
		"een nummertje maken",
		"een wip maken",
		"eikel",
		"engerd",
		"flamoes",
		"flikken",
		"flikker",
		"gadverdamme",
		"galbak",
		"gat",
		"gedoogzone",
		"geilneef",
		"gesodemieter",
		"godverdomme",
		"graftak",
		"gras maaien",
		"gratenkutg",
		"greppeldel",
		"griet",
		"hoempert",
		"hoer",
		"hoerenbuurt",
		"hoerenloper",
		"hoerig",
		"hol",
		"hufter",
		"huisdealer",
		"johny",
		"kanen",
		"kettingzeugg",
		"klaarkomen",
		"klerebeer",
		"klojo",
		"klooien",
		"klootjesvolk",
		"klootoog",
		"klootzak",
		"kloten",
		"knor",
		"kontg",
		"kontneuken",
		"krentekakker",
		"kut",
		"kuttelikkertje",
		"kwakkieg",
		"liefdesgrot",
		"lul",
		"lul-de-behanger",
		"lulhannes",
		"lummel",
		"mafketel",
		"matennaaierg",
		"matje",
		"mof",
		"mutsg",
		"naaien",
		"naakt",
		"neuken",
		"neukstier",
		"nicht",
		"oetlul",
		"opgeilen",
		"opkankeren",
		"oprotten",
		"opsodemieteren",
		"op z'n hondjes",
		"op z'n sodemieter geven",
		"opzouten",
		"ouwehoer",
		"ouwehoeren",
		"ouwe rukker",
		"paal",
		"paardelul",
		"palen",
		"penozeg",
		"piesen",
		"pijpbekkieg",
		"pijpen",
		"pik",
		"pleurislaaier",
		"poep",
		"poepen",
		"poot",
		"portiekslet",
		"pot",
		"potverdorie",
		"publiciteitsgeil",
		"raaskallen",
		"reet",
		"reetridder",
		"reet trappen, voor zijn",
		"remsporeng",
		"reutelen",
		"rothoer",
		"rotzak",
		"rukhond",
		"rukken",
		"schatje",
		"schijt",
		"schijten",
		"schoft",
		"schuinsmarcheerder",
		"shit",
		"slempen",
		"sletg",
		"sletterig",
		"slik mijn zaad",
		"snolg",
		"spuiten",
		"standje",
		"standje-69g",
		"stoephoer",
		"stootje",
		"strontg",
		"sufferdg",
		"tapijtnek",
		"teefg",
		"temeier",
		"teringlijer",
		"toeter",
		"tongzoeng",
		"triootjeg",
		"trottoir prostituée",
		"trottoirteef",
		"vergallen",
		"verkloten",
		"verneuken",
		"viespeuk",
		"vingeren",
		"vleesroos",
		"voor jan lul",
		"voor jan-met-de-korte-achternaam",
		"watje",
		"welzijnsmafia",
		"wijf",
		"wippen",
		"wuftje",
		"zaadje",
		"zakkenwasser",
		"zeiken",
		"zeiker",
		"zuigen",
		"zuiplap"
	] }.words,
	swedish: { words: [
		"arsle",
		"brutta",
		"discofitta",
		"dra åt helvete",
		"fan",
		"fitta",
		"fittig",
		"för helvete",
		"helvete",
		"hård",
		"jävlar",
		"knulla",
		"kuk",
		"kuksås",
		"kötthuvud",
		"köttnacke",
		"moona",
		"moonade",
		"moonar",
		"moonat",
		"mutta",
		"nigger",
		"neger",
		"olla",
		"pippa",
		"pitt",
		"prutt",
		"pök",
		"runka",
		"röv",
		"rövhål",
		"rövknulla",
		"satan",
		"skita",
		"skit ner dig",
		"skäggbiff",
		"snedfitta",
		"snefitta",
		"stake",
		"subba",
		"sås",
		"sätta på",
		"tusan"
	] }.words,
	thai: { words: [
		"กระดอ",
		"กระเด้า",
		"กระหรี่",
		"กะปิ",
		"กู",
		"ขี้",
		"ควย",
		"จิ๋ม",
		"จู๋",
		"เจ๊ก",
		"เจี๊ยว",
		"ดอกทอง",
		"ตอแหล",
		"ตูด",
		"น้ําแตก",
		"มึง",
		"แม่ง",
		"เย็ด",
		"รูตูด",
		"ล้างตู้เย็น",
		"ส้นตีน",
		"สัด",
		"เสือก",
		"หญิงชาติชั่ว",
		"หลั่ง",
		"ห่า",
		"หํา",
		"หี",
		"เหี้ย",
		"อมนกเขา",
		"ไอ้ควาย"
	] }.words
};
var SeverityLevel = /* @__PURE__ */ ((SeverityLevel2) => {
	SeverityLevel2[SeverityLevel2["EXACT"] = 1] = "EXACT";
	SeverityLevel2[SeverityLevel2["FUZZY"] = 2] = "FUZZY";
	return SeverityLevel2;
})(SeverityLevel || {});
var POSITIVE_INDICATORS = /* @__PURE__ */ new Set([
	"amazing",
	"awesome",
	"excellent",
	"fantastic",
	"great",
	"love",
	"wonderful",
	"brilliant",
	"perfect",
	"incredible",
	"outstanding",
	"superb",
	"magnificent",
	"marvelous",
	"spectacular",
	"phenomenal",
	"terrific",
	"fabulous",
	"divine",
	"best",
	"good",
	"nice",
	"cool",
	"sweet",
	"rad",
	"sick",
	"dope",
	"fire",
	"lit",
	"epic",
	"legendary",
	"godlike",
	"insane",
	"crazy",
	"wild",
	"beast",
	"movie",
	"film",
	"show",
	"song",
	"music",
	"game",
	"book",
	"restaurant",
	"food",
	"dish",
	"meal",
	"place",
	"spot",
	"location",
	"experience"
]);
var NEGATIVE_INDICATORS = /* @__PURE__ */ new Set([
	"hate",
	"terrible",
	"awful",
	"horrible",
	"disgusting",
	"pathetic",
	"stupid",
	"idiot",
	"moron",
	"loser",
	"worthless",
	"useless",
	"garbage",
	"trash",
	"suck",
	"sucks",
	"worst",
	"bad",
	"ugly",
	"gross",
	"nasty",
	"annoying",
	"irritating",
	"frustrating",
	"disappointing",
	"lame",
	"weak",
	"fail",
	"you",
	"your",
	"yourself",
	"u",
	"ur",
	"ure",
	"youre"
]);
var GAMING_POSITIVE = /* @__PURE__ */ new Set([
	"player",
	"gamer",
	"team",
	"squad",
	"clan",
	"guild",
	"match",
	"game",
	"round",
	"level",
	"boss",
	"raid",
	"quest",
	"achievement",
	"skill",
	"build",
	"loadout",
	"strategy",
	"tactic",
	"play",
	"move",
	"combo"
]);
var POSITIVE_PHRASES = /* @__PURE__ */ new Map([
	["the bomb", .9],
	["da bomb", .9],
	["bomb.com", .9],
	["bomb diggity", .9],
	["photo bomb", .8],
	["bath bomb", .8],
	["bomb squad", .7]
]);
var NEGATIVE_PHRASES = /* @__PURE__ */ new Map([
	["you are", .1],
	["ur a", .1],
	["such a", .2],
	["fucking", .1],
	["damn", .2]
]);
var ContextAnalyzer = class {
	constructor(config) {
		this.contextWindow = config.contextWindow;
		this.language = config.language;
		this.domainWhitelists = new Set(config.domainWhitelists || []);
	}
	/**
	* Analyzes the context around a profanity match to determine if it should be flagged
	*/
	analyzeContext(text, matchWord, matchIndex) {
		const words = this.tokenize(text);
		const matchWordIndex = this.findWordIndex(words, matchIndex);
		if (matchWordIndex === -1) return {
			contextScore: .5,
			reason: "Could not locate match in tokenized text",
			isWhitelisted: false
		};
		const startIndex = Math.max(0, matchWordIndex - this.contextWindow);
		const endIndex = Math.min(words.length, matchWordIndex + this.contextWindow + 1);
		const contextWords = words.slice(startIndex, endIndex);
		const contextText = contextWords.join(" ").toLowerCase();
		const phraseResult = this.checkPhraseContext(contextText, matchWord);
		if (phraseResult) return phraseResult;
		if (this.isDomainWhitelisted(contextWords, matchWord)) return {
			contextScore: .8,
			reason: "Domain-specific whitelist match",
			isWhitelisted: true
		};
		const sentimentScore = this.calculateSentimentScore(contextWords, matchWordIndex - startIndex);
		return {
			contextScore: sentimentScore,
			reason: this.generateReason(sentimentScore, contextWords),
			isWhitelisted: false
		};
	}
	checkPhraseContext(contextText, matchWord) {
		for (const [phrase, score] of POSITIVE_PHRASES.entries()) if (contextText.includes(phrase)) return {
			contextScore: score,
			reason: `Positive phrase detected: "${phrase}"`,
			isWhitelisted: true
		};
		for (const [phrase, score] of NEGATIVE_PHRASES.entries()) if (contextText.includes(phrase)) return {
			contextScore: score,
			reason: `Negative phrase detected: "${phrase}"`,
			isWhitelisted: false
		};
		return null;
	}
	isDomainWhitelisted(contextWords, matchWord) {
		for (const word of contextWords) if (this.domainWhitelists.has(word) || GAMING_POSITIVE.has(word)) return true;
		return false;
	}
	generateReason(score, contextWords) {
		if (score >= .7) return "Positive context detected - likely not profanity";
		else if (score <= .3) return "Negative context detected - likely profanity";
		else return "Neutral context - uncertain classification";
	}
	tokenize(text) {
		return text.toLowerCase().replace(/[^\w\s]/g, " ").split(/\s+/).filter((word) => word.length > 0);
	}
	findWordIndex(words, charIndex) {
		let currentPos = 0;
		for (let i = 0; i < words.length; i++) {
			if (currentPos >= charIndex) return Math.max(0, i - 1);
			currentPos += words[i].length + 1;
		}
		return words.length - 1;
	}
	calculateSentimentScore(contextWords, matchPosition) {
		let positiveCount = 0;
		let negativeCount = 0;
		const totalWords = contextWords.length;
		for (let i = 0; i < contextWords.length; i++) {
			const word = contextWords[i];
			const distance = Math.abs(i - matchPosition);
			const weight = Math.max(.1, 1 - distance * .2);
			if (POSITIVE_INDICATORS.has(word)) positiveCount += weight;
			else if (NEGATIVE_INDICATORS.has(word)) negativeCount += weight;
		}
		const totalSentiment = positiveCount + negativeCount;
		if (totalSentiment === 0) return .5;
		const rawScore = positiveCount / totalSentiment;
		let adjustedScore = rawScore;
		const confidenceMultiplier = Math.min(1, totalWords / 5);
		adjustedScore = .5 + (adjustedScore - .5) * confidenceMultiplier;
		if (contextWords.some((word) => [
			"you",
			"your",
			"u",
			"ur"
		].includes(word)) && rawScore < .7) adjustedScore *= .7;
		if (contextWords.some((word) => [
			"movie",
			"song",
			"game",
			"book",
			"show",
			"this",
			"that",
			"it"
		].includes(word)) && rawScore > .3) adjustedScore = Math.min(1, adjustedScore * 1.3);
		return Math.max(0, Math.min(1, adjustedScore));
	}
	/**
	* Updates the domain whitelist for this analyzer instance
	*/
	updateDomainWhitelist(newWhitelist) {
		this.domainWhitelists = new Set(newWhitelist);
	}
	/**
	* Adds words to the domain whitelist
	*/
	addToDomainWhitelist(words) {
		words.forEach((word) => this.domainWhitelists.add(word.toLowerCase()));
	}
};
var Filter = class {
	constructor(config) {
		var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k, _l;
		const defaultLanguage = "english";
		this.enableContextAware = (_a = config == null ? void 0 : config.enableContextAware) != null ? _a : false;
		this.contextWindow = (_b = config == null ? void 0 : config.contextWindow) != null ? _b : 3;
		this.confidenceThreshold = (_c = config == null ? void 0 : config.confidenceThreshold) != null ? _c : .7;
		this.primaryLanguage = ((_d = config == null ? void 0 : config.languages) == null ? void 0 : _d[0]) || defaultLanguage;
		if (this.enableContextAware) this.contextAnalyzer = new ContextAnalyzer({
			contextWindow: this.contextWindow,
			language: this.primaryLanguage,
			domainWhitelists: ((_e = config == null ? void 0 : config.domainWhitelists) == null ? void 0 : _e[this.primaryLanguage]) || []
		});
		let words = [];
		this.caseSensitive = (_f = config == null ? void 0 : config.caseSensitive) != null ? _f : false;
		this.allowObfuscatedMatch = (_g = config == null ? void 0 : config.allowObfuscatedMatch) != null ? _g : false;
		this.wordBoundaries = (_h = config == null ? void 0 : config.wordBoundaries) != null ? _h : !this.allowObfuscatedMatch;
		this.replaceWith = config == null ? void 0 : config.replaceWith;
		this.severityLevels = (_i = config == null ? void 0 : config.severityLevels) != null ? _i : false;
		this.ignoreWords = new Set(((_j = config == null ? void 0 : config.ignoreWords) == null ? void 0 : _j.map((word) => word.toLowerCase())) || []);
		this.logProfanity = (_k = config == null ? void 0 : config.logProfanity) != null ? _k : false;
		this.fuzzyToleranceLevel = (_l = config == null ? void 0 : config.fuzzyToleranceLevel) != null ? _l : .8;
		if (config == null ? void 0 : config.allLanguages) {
			for (const lang in dictionary_default) if (Object.prototype.hasOwnProperty.call(dictionary_default, lang)) words = [...words, ...dictionary_default[lang]];
		} else {
			const languages = (config == null ? void 0 : config.languages) || ["english"];
			new Set(languages).forEach((lang) => {
				words = [...words, ...dictionary_default[lang]];
			});
		}
		if (config == null ? void 0 : config.customWords) words = [...words, ...config.customWords];
		this.words = new Map(words.map((word) => [word.toLowerCase(), 1]));
	}
	debugLog(...args) {
		if (this.logProfanity) console.log("[glin-profanity]", ...args);
	}
	normalizeObfuscated(text) {
		let normalized = text.replace(/([a-zA-Z])\1{1,}/g, "$1$1");
		const charMap = {
			"@": "a",
			$: "s",
			"!": "i",
			"1": "i",
			"*": ""
		};
		normalized = normalized.replace(/[@$!1*]/g, (m) => charMap[m] || m);
		return normalized;
	}
	getRegex(word) {
		const flags = this.caseSensitive ? "g" : "gi";
		const escapedWord = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
		const boundary = this.wordBoundaries ? "\\b" : "";
		return new RegExp(`${boundary}${escapedWord}${boundary}`, flags);
	}
	isFuzzyToleranceMatch(word, text) {
		const simplifiedText = text.toLowerCase().replace(/[^a-z]/g, "");
		const simplifiedWord = word.toLowerCase();
		let matchCount = 0;
		let index = 0;
		for (let i = 0; i < simplifiedText.length; i++) if (simplifiedText[i] === simplifiedWord[index]) {
			matchCount++;
			index++;
			if (index === simplifiedWord.length) break;
		}
		return matchCount / simplifiedWord.length >= this.fuzzyToleranceLevel;
	}
	evaluateSeverity(word, text) {
		if (this.wordBoundaries && this.getRegex(word).test(text)) return 1;
		if (this.getRegex(word).test(text)) return 1;
		if (this.isFuzzyToleranceMatch(word, text)) return 2;
	}
	isProfane(value) {
		const input = this.allowObfuscatedMatch ? this.normalizeObfuscated(value) : value;
		for (const word of this.words.keys()) if (!this.ignoreWords.has(word.toLowerCase()) && this.evaluateSeverity(word, input) !== void 0) return true;
		return false;
	}
	matches(word) {
		return this.isProfane(word);
	}
	checkProfanity(text) {
		if (!this.enableContextAware) {
			let input2 = this.allowObfuscatedMatch ? this.normalizeObfuscated(text) : text;
			input2 = input2.toLowerCase();
			const profaneWords2 = [];
			const severityMap2 = {};
			for (const dictWord of this.words.keys()) {
				if (this.ignoreWords.has(dictWord.toLowerCase())) continue;
				const severity = this.evaluateSeverity(dictWord, input2);
				if (severity !== void 0) {
					const regex = this.getRegex(dictWord);
					let match;
					while ((match = regex.exec(input2)) !== null) {
						profaneWords2.push(match[0]);
						if (severityMap2[match[0]] === void 0) severityMap2[match[0]] = severity;
					}
				}
			}
			let processedText2 = text;
			if (this.replaceWith && profaneWords2.length > 0) {
				const uniqueWords = Array.from(new Set(profaneWords2));
				for (const word of uniqueWords) {
					const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
					const replacementRegex = this.wordBoundaries ? new RegExp(`\\b${escaped}\\b`, "gi") : new RegExp(escaped, "gi");
					processedText2 = processedText2.replace(replacementRegex, this.replaceWith);
				}
			}
			return {
				containsProfanity: profaneWords2.length > 0,
				profaneWords: Array.from(new Set(profaneWords2)),
				processedText: this.replaceWith ? processedText2 : void 0,
				severityMap: this.severityLevels && Object.keys(severityMap2).length > 0 ? severityMap2 : void 0
			};
		}
		let input = this.allowObfuscatedMatch ? this.normalizeObfuscated(text) : text;
		input = input.toLowerCase();
		const originalText = text;
		const profaneWords = [];
		const severityMap = {};
		const matches = [];
		for (const dictWord of this.words.keys()) {
			if (this.ignoreWords.has(dictWord.toLowerCase())) continue;
			const severity = this.evaluateSeverity(dictWord, input);
			if (severity !== void 0) {
				const regex = this.getRegex(dictWord);
				let match;
				while ((match = regex.exec(input)) !== null) {
					const matchedWord = match[0];
					const matchIndex = match.index;
					const matchObj = {
						word: matchedWord,
						index: matchIndex,
						severity
					};
					if (this.enableContextAware && this.contextAnalyzer) {
						const contextResult = this.contextAnalyzer.analyzeContext(originalText, matchedWord, matchIndex);
						matchObj.contextScore = contextResult.contextScore;
						matchObj.reason = contextResult.reason;
						matchObj.isWhitelisted = contextResult.isWhitelisted;
						if (contextResult.isWhitelisted || contextResult.contextScore > this.confidenceThreshold) continue;
					}
					profaneWords.push(matchedWord);
					if (severityMap[matchedWord] === void 0) severityMap[matchedWord] = severity;
					matches.push(matchObj);
				}
			}
		}
		if (profaneWords.length > 0) this.debugLog("Detected:", profaneWords);
		let processedText = text;
		if (this.replaceWith && profaneWords.length > 0) {
			const uniqueWords = Array.from(new Set(profaneWords));
			for (const word of uniqueWords) {
				const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
				const replacementRegex = this.wordBoundaries ? new RegExp(`\\b${escaped}\\b`, "gi") : new RegExp(escaped, "gi");
				processedText = processedText.replace(replacementRegex, this.replaceWith);
			}
		}
		let contextScore;
		if (this.enableContextAware && matches.length > 0) contextScore = matches.reduce((sum, match) => sum + (match.contextScore || .5), 0) / matches.length;
		return {
			containsProfanity: profaneWords.length > 0,
			profaneWords: Array.from(new Set(profaneWords)),
			processedText: this.replaceWith ? processedText : void 0,
			severityMap: this.severityLevels && Object.keys(severityMap).length > 0 ? severityMap : void 0,
			matches: matches.length > 0 ? matches : void 0,
			contextScore,
			reason: matches.length > 0 ? `Found ${matches.length} potential profanity matches` : "No profanity detected"
		};
	}
	checkProfanityWithMinSeverity(text, minSeverity = 1) {
		const result = this.checkProfanity(text);
		return {
			filteredWords: result.severityMap && result.profaneWords.length > 0 ? result.profaneWords.filter((word) => {
				var _a;
				const severity = (_a = result.severityMap) == null ? void 0 : _a[word];
				return typeof severity === "number" && severity >= minSeverity;
			}) : [],
			result
		};
	}
};
var globalWhitelist_default = { whitelist: [
	"Document",
	"Assume",
	"Assistant",
	"Assignment",
	"Bass",
	"Class",
	"Grass",
	"Pass",
	"Analytics",
	"Pension",
	"Night",
	"Butler",
	"Canal",
	"Election",
	"Spreadsheet",
	"Accountant",
	"Cucumber",
	"Analysis",
	"Japan",
	"Analytics",
	"Manipulate",
	"Shoot",
	"Button",
	"Scrutiny",
	"Constitution",
	"Associate",
	"Country"
] };
function createFilterConfig(config) {
	var _a;
	const effective = __spreadProps(__spreadValues({}, config != null ? config : {}), {
		ignoreWords: globalWhitelist_default.whitelist,
		fuzzyToleranceLevel: (_a = config == null ? void 0 : config.fuzzyToleranceLevel) != null ? _a : .8
	});
	if (effective.allowObfuscatedMatch && effective.wordBoundaries) console.warn("[Glin-Profanity] Obfuscated match enabled → wordBoundaries will be ignored internally.");
	return effective;
}
function checkProfanity(text, config) {
	var _a;
	const checkResult = new Filter(createFilterConfig(config)).checkProfanity(text);
	const filteredWords = (config == null ? void 0 : config.minSeverity) && checkResult.severityMap ? checkResult.profaneWords.filter((word) => checkResult.severityMap && checkResult.severityMap[word] >= config.minSeverity) : checkResult.profaneWords;
	const autoReplaced = (config == null ? void 0 : config.autoReplace) && checkResult.processedText ? checkResult.processedText : text;
	(_a = config == null ? void 0 : config.customActions) == null || _a.call(config, checkResult);
	return __spreadProps(__spreadValues({}, checkResult), {
		filteredWords,
		autoReplaced
	});
}
function checkProfanityAsync(text, config) {
	return __async(this, null, function* () {
		return Promise.resolve(checkProfanity(text, config));
	});
}
function isWordProfane(word, config) {
	return checkProfanity(word, config).containsProfanity;
}
var import_react = __toESM(require_react(), 1);
var useProfanityChecker = (config) => {
	var _a;
	const [result, setResult] = (0, import_react.useState)(null);
	const checkText = (0, import_react.useCallback)((text) => {
		const checkResult = checkProfanity(text, config);
		setResult(checkResult);
		return checkResult;
	}, [config]);
	const checkTextAsync = (0, import_react.useCallback)((text) => __async(null, null, function* () {
		const checkResult = yield checkProfanityAsync(text, config);
		setResult(checkResult);
		return checkResult;
	}), [config]);
	const isWordProfaneCallback = (0, import_react.useCallback)((word) => {
		return isWordProfane(word, config);
	}, [config]);
	return {
		result,
		checkText,
		checkTextAsync,
		reset: (0, import_react.useCallback)(() => setResult(null), []),
		isDirty: (_a = result == null ? void 0 : result.containsProfanity) != null ? _a : false,
		isWordProfane: isWordProfaneCallback
	};
};
/*! Bundled license information:

react/cjs/react.production.min.js:
(**
* @license React
* react.production.min.js
*
* Copyright (c) Facebook, Inc. and its affiliates.
*
* This source code is licensed under the MIT license found in the
* LICENSE file in the root directory of this source tree.
*)

react/cjs/react.development.js:
(**
* @license React
* react.development.js
*
* Copyright (c) Facebook, Inc. and its affiliates.
*
* This source code is licensed under the MIT license found in the
* LICENSE file in the root directory of this source tree.
*)
*/
//#endregion
export { Filter, Filter as ProfanityFilter, SeverityLevel, checkProfanity, checkProfanityAsync, isWordProfane, useProfanityChecker };

//# sourceMappingURL=dist-DxOnYUkS.js.map