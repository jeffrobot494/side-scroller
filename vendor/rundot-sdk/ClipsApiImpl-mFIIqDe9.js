import { a as isWebPlatform, n as createMockDelay, t as MOCK_DELAYS } from "./core-DLpmdjtO.js";
import { g as RundotApiError, o as utf8ByteLength } from "./replaySize-CX50idnG.js";
//#region src/RundotGameMessageId.ts
let RundotGameMessageId = /* @__PURE__ */ function(RundotGameMessageId) {
	RundotGameMessageId["H5_RESPONSE"] = "H5_RESPONSE";
	RundotGameMessageId["IS_REWARDED_AD_READY"] = "H5_IS_REWARDED_AD_READY";
	RundotGameMessageId["IS_INTERSTITIAL_AD_READY"] = "H5_IS_INTERSTITIAL_AD_READY";
	RundotGameMessageId["SHOW_REWARDED_AD"] = "H5_SHOW_REWARDED_AD";
	RundotGameMessageId["SHOW_INTERSTITIAL_AD"] = "H5_SHOW_INTERSTITIAL_AD";
	RundotGameMessageId["LOG_ANALYTICS_EVENT"] = "H5_LOG_ANALYTICS_EVENT";
	RundotGameMessageId["TRACK_FUNNEL_STEP"] = "H5_TRACK_FUNNEL_STEP";
	RundotGameMessageId["HEARTBEAT"] = "H5_HEARTBEAT";
	RundotGameMessageId["DEVICE_CACHE_GET_ITEM"] = "H5_DEVICE_CACHE_GET_ITEM";
	RundotGameMessageId["DEVICE_CACHE_SET_ITEM"] = "H5_DEVICE_CACHE_SET_ITEM";
	RundotGameMessageId["DEVICE_CACHE_REMOVE_ITEM"] = "H5_DEVICE_CACHE_REMOVE_ITEM";
	RundotGameMessageId["DEVICE_CACHE_CLEAR"] = "H5_DEVICE_CACHE_CLEAR";
	RundotGameMessageId["DEVICE_CACHE_KEY"] = "H5_DEVICE_CACHE_KEY";
	RundotGameMessageId["DEVICE_CACHE_LENGTH"] = "H5_DEVICE_CACHE_LENGTH";
	RundotGameMessageId["APP_STORAGE_GET_ITEM"] = "H5_APP_STORAGE_GET_ITEM";
	RundotGameMessageId["APP_STORAGE_SET_ITEM"] = "H5_APP_STORAGE_SET_ITEM";
	RundotGameMessageId["APP_STORAGE_REMOVE_ITEM"] = "H5_APP_STORAGE_REMOVE_ITEM";
	RundotGameMessageId["APP_STORAGE_CLEAR"] = "H5_APP_STORAGE_CLEAR";
	RundotGameMessageId["APP_STORAGE_KEY"] = "H5_APP_STORAGE_KEY";
	RundotGameMessageId["APP_STORAGE_LENGTH"] = "H5_APP_STORAGE_LENGTH";
	RundotGameMessageId["APP_STORAGE_GET_ALL_ITEMS"] = "H5_APP_STORAGE_GET_ALL_ITEMS";
	RundotGameMessageId["APP_STORAGE_GET_ALL_DATA"] = "H5_APP_STORAGE_GET_ALL_DATA";
	RundotGameMessageId["APP_STORAGE_SET_MULTIPLE_ITEMS"] = "H5_APP_STORAGE_SET_MULTIPLE_ITEMS";
	RundotGameMessageId["APP_STORAGE_REMOVE_MULTIPLE_ITEMS"] = "H5_APP_STORAGE_REMOVE_MULTIPLE_ITEMS";
	RundotGameMessageId["APP_STORAGE_COMPARE_AND_SWAP"] = "H5_APP_STORAGE_COMPARE_AND_SWAP";
	RundotGameMessageId["APP_STORAGE_GET_MULTIPLE_ITEMS"] = "H5_APP_STORAGE_GET_MULTIPLE_ITEMS";
	RundotGameMessageId["OWNER_STORAGE_GET_ITEM"] = "H5_OWNER_STORAGE_GET_ITEM";
	RundotGameMessageId["OWNER_STORAGE_SET_ITEM"] = "H5_OWNER_STORAGE_SET_ITEM";
	RundotGameMessageId["OWNER_STORAGE_REMOVE_ITEM"] = "H5_OWNER_STORAGE_REMOVE_ITEM";
	RundotGameMessageId["OWNER_STORAGE_CLEAR"] = "H5_OWNER_STORAGE_CLEAR";
	RundotGameMessageId["OWNER_STORAGE_KEY"] = "H5_OWNER_STORAGE_KEY";
	RundotGameMessageId["OWNER_STORAGE_LENGTH"] = "H5_OWNER_STORAGE_LENGTH";
	RundotGameMessageId["OWNER_STORAGE_GET_ALL_ITEMS"] = "H5_OWNER_STORAGE_GET_ALL_ITEMS";
	RundotGameMessageId["OWNER_STORAGE_GET_ALL_DATA"] = "H5_OWNER_STORAGE_GET_ALL_DATA";
	RundotGameMessageId["OWNER_STORAGE_SET_MULTIPLE_ITEMS"] = "H5_OWNER_STORAGE_SET_MULTIPLE_ITEMS";
	RundotGameMessageId["OWNER_STORAGE_REMOVE_MULTIPLE_ITEMS"] = "H5_OWNER_STORAGE_REMOVE_MULTIPLE_ITEMS";
	RundotGameMessageId["GLOBAL_STORAGE_GET_ITEM"] = "H5_GLOBAL_STORAGE_GET_ITEM";
	RundotGameMessageId["GLOBAL_STORAGE_SET_ITEM"] = "H5_GLOBAL_STORAGE_SET_ITEM";
	RundotGameMessageId["GLOBAL_STORAGE_REMOVE_ITEM"] = "H5_GLOBAL_STORAGE_REMOVE_ITEM";
	RundotGameMessageId["GLOBAL_STORAGE_CLEAR"] = "H5_GLOBAL_STORAGE_CLEAR";
	RundotGameMessageId["GLOBAL_STORAGE_KEY"] = "H5_GLOBAL_STORAGE_KEY";
	RundotGameMessageId["GLOBAL_STORAGE_LENGTH"] = "H5_GLOBAL_STORAGE_LENGTH";
	RundotGameMessageId["GLOBAL_STORAGE_GET_ALL_ITEMS"] = "H5_GLOBAL_STORAGE_GET_ALL_ITEMS";
	RundotGameMessageId["GLOBAL_STORAGE_SET_MULTIPLE_ITEMS"] = "H5_GLOBAL_STORAGE_SET_MULTIPLE_ITEMS";
	RundotGameMessageId["GLOBAL_STORAGE_REMOVE_MULTIPLE_ITEMS"] = "H5_GLOBAL_STORAGE_REMOVE_MULTIPLE_ITEMS";
	RundotGameMessageId["SHARED_STORAGE_GET_ITEM"] = "H5_SHARED_STORAGE_GET_ITEM";
	RundotGameMessageId["SHARED_STORAGE_SET_ITEM"] = "H5_SHARED_STORAGE_SET_ITEM";
	RundotGameMessageId["SHARED_STORAGE_REMOVE_ITEM"] = "H5_SHARED_STORAGE_REMOVE_ITEM";
	RundotGameMessageId["SHARED_STORAGE_CLEAR"] = "H5_SHARED_STORAGE_CLEAR";
	RundotGameMessageId["SHARED_STORAGE_KEY"] = "H5_SHARED_STORAGE_KEY";
	RundotGameMessageId["SHARED_STORAGE_LENGTH"] = "H5_SHARED_STORAGE_LENGTH";
	RundotGameMessageId["SHARED_STORAGE_GET_ALL_ITEMS"] = "H5_SHARED_STORAGE_GET_ALL_ITEMS";
	RundotGameMessageId["SHARED_STORAGE_GET_ALL_DATA"] = "H5_SHARED_STORAGE_GET_ALL_DATA";
	RundotGameMessageId["SHARED_STORAGE_SET_MULTIPLE_ITEMS"] = "H5_SHARED_STORAGE_SET_MULTIPLE_ITEMS";
	RundotGameMessageId["SHARED_STORAGE_REMOVE_MULTIPLE_ITEMS"] = "H5_SHARED_STORAGE_REMOVE_MULTIPLE_ITEMS";
	RundotGameMessageId["SHARED_STORAGE_INBOUND_LIST_SOURCES"] = "H5_SHARED_STORAGE_INBOUND_LIST_SOURCES";
	RundotGameMessageId["SHARED_STORAGE_INBOUND_GET"] = "H5_SHARED_STORAGE_INBOUND_GET";
	RundotGameMessageId["SHARED_STORAGE_INBOUND_GET_ALL_FROM_SOURCE"] = "H5_SHARED_STORAGE_INBOUND_GET_ALL_FROM_SOURCE";
	RundotGameMessageId["SHARED_STORAGE_INBOUND_GET_ALL_FOR_KEY"] = "H5_SHARED_STORAGE_INBOUND_GET_ALL_FOR_KEY";
	/** @deprecated */
	RundotGameMessageId["AVATAR3D_LOAD"] = "H5_AVATAR3D_LOAD";
	/** @deprecated */
	RundotGameMessageId["AVATAR3D_SAVE"] = "H5_AVATAR3D_SAVE";
	/** @deprecated */
	RundotGameMessageId["AVATAR3D_DELETE"] = "H5_AVATAR3D_DELETE";
	RundotGameMessageId["H5_STACK_PUSH_REQUEST"] = "H5_STACK_PUSH_REQUEST";
	RundotGameMessageId["H5_STACK_POP_REQUEST"] = "H5_STACK_POP_REQUEST";
	RundotGameMessageId["H5_NAVIGATE_TO_GAME"] = "H5_NAVIGATE_TO_GAME";
	/** Host pushes refreshed notificationParams when a tap arrives for a running game. */
	RundotGameMessageId["NOTIFICATION_PARAMS_UPDATE"] = "NOTIFICATION_PARAMS_UPDATE";
	/**
	* Fire-and-forget ACK the SDK sends to the host immediately after it
	* registers its `NOTIFICATION_PARAMS_UPDATE` subscription inside
	* `initializeContext`. Lets the host distinguish "SDK booted past READY"
	* from "SDK has a live subscriber" and skip the stash for live taps that
	* are guaranteed to be received.
	*/
	RundotGameMessageId["NOTIFICATION_PARAMS_SUBSCRIBE_READY"] = "NOTIFICATION_PARAMS_SUBSCRIBE_READY";
	RundotGameMessageId["SCHEDULE_LOCAL_NOTIFICATION"] = "H5_SCHEDULE_LOCAL_NOTIFICATION";
	RundotGameMessageId["CANCEL_LOCAL_NOTIFICATION"] = "H5_CANCEL_LOCAL_NOTIFICATION";
	RundotGameMessageId["GET_ALL_SCHEDULED_LOCAL_NOTIFICATIONS"] = "H5_GET_ALL_SCHEDULED_LOCAL_NOTIFICATIONS";
	RundotGameMessageId["IS_LOCAL_NOTIFICATIONS_ENABLED"] = "H5_IS_LOCAL_NOTIFICATIONS_ENABLED";
	RundotGameMessageId["SET_LOCAL_NOTIFICATIONS_ENABLED"] = "H5_SET_LOCAL_NOTIFICATIONS_ENABLED";
	RundotGameMessageId["MESSAGING_GET_RCS_AVAILABLE"] = "H5_MESSAGING_GET_RCS_AVAILABLE";
	RundotGameMessageId["MESSAGING_SCHEDULE_RCS"] = "H5_MESSAGING_SCHEDULE_RCS";
	RundotGameMessageId["MESSAGING_SUBMIT_MESSAGE"] = "H5_MESSAGING_SUBMIT_MESSAGE";
	RundotGameMessageId["MESSAGING_REQUEST_RCS_OPT_IN"] = "H5_MESSAGING_REQUEST_RCS_OPT_IN";
	RundotGameMessageId["TOAST"] = "H5_TOAST";
	RundotGameMessageId["LIKE_DIALOG"] = "H5_LIKE_DIALOG";
	RundotGameMessageId["LIKE_DIALOG_CAN_SHOW"] = "H5_LIKE_DIALOG_CAN_SHOW";
	RundotGameMessageId["LIKE_STATE"] = "H5_LIKE_STATE";
	RundotGameMessageId["COMMENTS_PANEL"] = "H5_COMMENTS_PANEL";
	RundotGameMessageId["COMMENTS_PANEL_CAN_SHOW"] = "H5_COMMENTS_PANEL_CAN_SHOW";
	RundotGameMessageId["REQUEST_SERVER_TIME"] = "H5_REQUEST_SERVER_TIME";
	RundotGameMessageId["SHARE_LINK"] = "H5_SHARE_LINK";
	RundotGameMessageId["CREATE_SHARE_QRCODE"] = "H5_CREATE_SHARE_QRCODE";
	RundotGameMessageId["SHARE_ADD_CLICK_DATA"] = "H5_SHARE_ADD_CLICK_DATA";
	RundotGameMessageId["SHARE_GET_CLICKS"] = "H5_SHARE_GET_CLICKS";
	RundotGameMessageId["SHARE_GET_MY_CLICK_DATA"] = "H5_SHARE_GET_MY_CLICK_DATA";
	RundotGameMessageId["SHARE_FILE"] = "H5_SHARE_FILE";
	RundotGameMessageId["CAN_SHARE_FILE"] = "H5_CAN_SHARE_FILE";
	RundotGameMessageId["SHARE_COMPOSE_POST"] = "H5_SHARE_COMPOSE_POST";
	RundotGameMessageId["SHARE_OPEN_FOLLOW_ME"] = "H5_SHARE_OPEN_FOLLOW_ME";
	RundotGameMessageId["SHARE_GET_FOLLOW_ME_PLATFORMS"] = "H5_SHARE_GET_FOLLOW_ME_PLATFORMS";
	RundotGameMessageId["SHARE_SET_INTENT"] = "H5_SHARE_SET_INTENT";
	RundotGameMessageId["SHARE_CLEAR_INTENT"] = "H5_SHARE_CLEAR_INTENT";
	RundotGameMessageId["GET_RELEASE_NOTES"] = "H5_GET_RELEASE_NOTES";
	RundotGameMessageId["OPEN_RELEASE_NOTES"] = "H5_OPEN_RELEASE_NOTES";
	RundotGameMessageId["AI_CHAT_COMPLETION"] = "H5_AI_CHAT_COMPLETION";
	RundotGameMessageId["AI_DECIDE"] = "H5_AI_DECIDE";
	RundotGameMessageId["AI_GET_AVAILABLE_MODELS"] = "H5_AI_GET_AVAILABLE_MODELS";
	RundotGameMessageId["AI_CHAT_COMPLETION_STREAM_START"] = "H5_AI_CHAT_COMPLETION_STREAM_START";
	RundotGameMessageId["AI_CHAT_COMPLETION_STREAM_ABORT"] = "H5_AI_CHAT_COMPLETION_STREAM_ABORT";
	RundotGameMessageId["AI_CHAT_COMPLETION_STREAM_CHUNK"] = "H5_AI_CHAT_COMPLETION_STREAM_CHUNK";
	RundotGameMessageId["AI_CHAT_COMPLETION_STREAM_DONE"] = "H5_AI_CHAT_COMPLETION_STREAM_DONE";
	RundotGameMessageId["AI_CHAT_COMPLETION_STREAM_ERROR"] = "H5_AI_CHAT_COMPLETION_STREAM_ERROR";
	RundotGameMessageId["TRIGGER_HAPTIC"] = "H5_TRIGGER_HAPTIC";
	RundotGameMessageId["GAMEPAD_SUBSCRIBE"] = "H5_GAMEPAD_SUBSCRIBE";
	RundotGameMessageId["GAMEPAD_UNSUBSCRIBE"] = "H5_GAMEPAD_UNSUBSCRIBE";
	RundotGameMessageId["GAMEPAD_SNAPSHOT"] = "GAMEPAD_SNAPSHOT";
	RundotGameMessageId["GAMEPAD_CONNECTED"] = "GAMEPAD_CONNECTED";
	RundotGameMessageId["GAMEPAD_DISCONNECTED"] = "GAMEPAD_DISCONNECTED";
	RundotGameMessageId["DEBUG"] = "H5_DEBUG";
	RundotGameMessageId["H5_IAP_GET_WALLET"] = "H5_IAP_GET_WALLET";
	RundotGameMessageId["H5_IAP_SPEND_CURRENCY"] = "H5_IAP_SPEND_CURRENCY";
	RundotGameMessageId["H5_IAP_GET_SUBSCRIPTIONS"] = "H5_IAP_GET_SUBSCRIPTIONS";
	RundotGameMessageId["H5_IAP_PURCHASE_SUBSCRIPTION"] = "H5_IAP_PURCHASE_SUBSCRIPTION";
	RundotGameMessageId["H5_IAP_GET_PLAYER_SUBSCRIPTION_INFO"] = "H5_IAP_GET_PLAYER_SUBSCRIPTION_INFO";
	RundotGameMessageId["H5_IAP_HAS_USER_MADE_PURCHASE"] = "H5_IAP_HAS_USER_MADE_PURCHASE";
	RundotGameMessageId["H5_IAP_LIST_DIRECT_PURCHASE_SKUS"] = "H5_IAP_LIST_DIRECT_PURCHASE_SKUS";
	RundotGameMessageId["IAP_SPEND_CURRENCY_COMPLETE"] = "IAP_SPEND_CURRENCY_COMPLETE";
	RundotGameMessageId["IAP_WALLET_UPDATE"] = "IAP_WALLET_UPDATE";
	RundotGameMessageId["H5_CREDITS_GET_BALANCE"] = "H5_CREDITS_GET_BALANCE";
	RundotGameMessageId["H5_CREDITS_GET_SUBSCRIPTION"] = "H5_CREDITS_GET_SUBSCRIPTION";
	RundotGameMessageId["H5_CREDITS_GET_PLANS"] = "H5_CREDITS_GET_PLANS";
	RundotGameMessageId["H5_CREDITS_GET_CONTEXT"] = "H5_CREDITS_GET_CONTEXT";
	RundotGameMessageId["H5_CREDITS_ESTIMATE_GENERATION_COST"] = "H5_CREDITS_ESTIMATE_GENERATION_COST";
	RundotGameMessageId["H5_CREDITS_OPEN_PAYWALL"] = "H5_CREDITS_OPEN_PAYWALL";
	RundotGameMessageId["H5_CREDITS_SET_CONFIG"] = "H5_CREDITS_SET_CONFIG";
	RundotGameMessageId["CREDITS_BALANCE_UPDATE"] = "CREDITS_BALANCE_UPDATE";
	RundotGameMessageId["READY"] = "READY";
	RundotGameMessageId["INIT_SDK"] = "INITIALIZE_SDK";
	RundotGameMessageId["PAUSE"] = "PAUSE";
	RundotGameMessageId["RESUME"] = "RESUME";
	RundotGameMessageId["AWAKE"] = "AWAKE";
	RundotGameMessageId["SLEEP"] = "SLEEP";
	RundotGameMessageId["QUIT"] = "QUIT";
	RundotGameMessageId["H5_REQUEST_LIFECYCLE_RESUME"] = "H5_REQUEST_LIFECYCLE_RESUME";
	RundotGameMessageId["IDENTITY_CHANGED"] = "IDENTITY_CHANGED";
	RundotGameMessageId["BACK_BUTTON"] = "BACK_BUTTON";
	RundotGameMessageId["BACK_BUTTON_HANDLER_SET"] = "H5_BACK_BUTTON_HANDLER_SET";
	/** given the experiment name, returns the entire experiment object as configured for the current user */
	RundotGameMessageId["GET_EXPERIMENT"] = "H5_GET_EXPERIMENT";
	/** returns the boolean value for a feature flag using the statsig parameter store, or the feature flags constants as fallback */
	RundotGameMessageId["GET_FEATURE_FLAG"] = "H5_GET_FEATURE_FLAG";
	/** returns the gate value (boolean) for a given feature gate for the current user */
	RundotGameMessageId["GET_FEATURE_GATE"] = "H5_GET_FEATURE_GATE";
	/** returns the raw liveops client rules + server clock for the game's active tag; the SDK resolves schedule windows client-side */
	RundotGameMessageId["GET_LIVEOPS_CONFIG"] = "H5_GET_LIVEOPS_CONFIG";
	RundotGameMessageId["H5_SIMULATION_EXECUTE_RECIPE"] = "H5_SIMULATION_EXECUTE_RECIPE";
	RundotGameMessageId["H5_SIMULATION_GET_ACTIVE_RUNS"] = "H5_SIMULATION_GET_ACTIVE_RUNS";
	RundotGameMessageId["H5_SIMULATION_COLLECT_RECIPE"] = "H5_SIMULATION_COLLECT_RECIPE";
	RundotGameMessageId["H5_SIMULATION_EXECUTE_SCOPED_RECIPE"] = "H5_SIMULATION_EXECUTE_SCOPED_RECIPE";
	RundotGameMessageId["H5_SIMULATION_GET_AVAILABLE_RECIPES"] = "H5_SIMULATION_GET_AVAILABLE_RECIPES";
	RundotGameMessageId["H5_SIMULATION_GET_RECIPE_REQUIREMENTS"] = "H5_SIMULATION_GET_RECIPE_REQUIREMENTS";
	RundotGameMessageId["H5_SIMULATION_GET_BATCH_RECIPE_REQUIREMENTS"] = "H5_SIMULATION_GET_BATCH_RECIPE_REQUIREMENTS";
	RundotGameMessageId["H5_SIMULATION_TRIGGER_RECIPE_CHAIN"] = "H5_SIMULATION_TRIGGER_RECIPE_CHAIN";
	RundotGameMessageId["H5_SIMULATION_RESOLVE_VALUE"] = "H5_SIMULATION_RESOLVE_VALUE";
	RundotGameMessageId["H5_SIMULATION_GET_ENTITY_METADATA"] = "H5_SIMULATION_GET_ENTITY_METADATA";
	RundotGameMessageId["H5_SIMULATION_GET_STATE"] = "H5_SIMULATION_GET_STATE";
	RundotGameMessageId["H5_SIMULATION_GET_CONFIG"] = "H5_SIMULATION_GET_CONFIG";
	RundotGameMessageId["H5_SIMULATION_GET_CONTAINERS"] = "H5_SIMULATION_GET_CONTAINERS";
	RundotGameMessageId["H5_SIMULATION_GET_ASSIGNMENTS"] = "H5_SIMULATION_GET_ASSIGNMENTS";
	RundotGameMessageId["H5_SIMULATION_ASSIGN_ITEM"] = "H5_SIMULATION_ASSIGN_ITEM";
	RundotGameMessageId["H5_SIMULATION_REMOVE_ITEM"] = "H5_SIMULATION_REMOVE_ITEM";
	RundotGameMessageId["H5_SIMULATION_CALCULATE_POWER_PREVIEW"] = "H5_SIMULATION_CALCULATE_POWER_PREVIEW";
	RundotGameMessageId["H5_SIMULATION_GET_AVAILABLE_ITEMS"] = "H5_SIMULATION_GET_AVAILABLE_ITEMS";
	RundotGameMessageId["H5_SIMULATION_VALIDATE_ASSIGNMENT"] = "H5_SIMULATION_VALIDATE_ASSIGNMENT";
	RundotGameMessageId["H5_SIMULATION_BATCH_OPERATIONS"] = "H5_SIMULATION_BATCH_OPERATIONS";
	RundotGameMessageId["H5_SIMULATION_SUBSCRIBE"] = "H5_SIMULATION_SUBSCRIBE";
	RundotGameMessageId["H5_SIMULATION_UNSUBSCRIBE"] = "H5_SIMULATION_UNSUBSCRIBE";
	RundotGameMessageId["H5_SIMULATION_UPDATE"] = "H5_SIMULATION_UPDATE";
	RundotGameMessageId["H5_SIMULATION_RESET_STATE"] = "H5_SIMULATION_RESET_STATE";
	RundotGameMessageId["H5_LEADERBOARD_CREATE_SCORE_TOKEN"] = "H5_LEADERBOARD_CREATE_SCORE_TOKEN";
	RundotGameMessageId["H5_LEADERBOARD_SUBMIT_SCORE"] = "H5_LEADERBOARD_SUBMIT_SCORE";
	RundotGameMessageId["H5_LEADERBOARD_GET_PAGED_SCORES"] = "H5_LEADERBOARD_GET_PAGED_SCORES";
	RundotGameMessageId["H5_LEADERBOARD_GET_PODIUM_SCORES"] = "H5_LEADERBOARD_GET_PODIUM_SCORES";
	RundotGameMessageId["H5_LEADERBOARD_GET_MY_RANK"] = "H5_LEADERBOARD_GET_MY_RANK";
	RundotGameMessageId["H5_ROOM_CREATE"] = "H5_ROOM_CREATE";
	RundotGameMessageId["H5_ROOM_JOIN"] = "H5_ROOM_JOIN";
	RundotGameMessageId["H5_ROOM_JOIN_OR_CREATE"] = "H5_ROOM_JOIN_OR_CREATE";
	RundotGameMessageId["H5_ROOM_LEAVE"] = "H5_ROOM_LEAVE";
	RundotGameMessageId["H5_ROOM_UPDATE_DATA"] = "H5_ROOM_UPDATE_DATA";
	RundotGameMessageId["H5_ROOM_GET_DATA"] = "H5_ROOM_GET_DATA";
	RundotGameMessageId["H5_ROOM_SUBSCRIBE"] = "H5_ROOM_SUBSCRIBE";
	RundotGameMessageId["H5_ROOM_UNSUBSCRIBE"] = "H5_ROOM_UNSUBSCRIBE";
	RundotGameMessageId["H5_ROOM_SEND_MESSAGE"] = "H5_ROOM_SEND_MESSAGE";
	RundotGameMessageId["H5_ROOM_GET_MESSAGES"] = "H5_ROOM_GET_MESSAGES";
	RundotGameMessageId["H5_ROOM_LIST_ROOMS"] = "H5_ROOM_LIST_ROOMS";
	RundotGameMessageId["H5_ROOM_LIST_PUBLIC"] = "H5_ROOM_LIST_PUBLIC";
	RundotGameMessageId["H5_ROOM_SEARCH"] = "H5_ROOM_SEARCH";
	RundotGameMessageId["H5_ROOM_JOIN_BY_CODE"] = "H5_ROOM_JOIN_BY_CODE";
	RundotGameMessageId["H5_ROOM_GET_USER_ROOMS"] = "H5_ROOM_GET_USER_ROOMS";
	RundotGameMessageId["H5_ROOM_GET_PLAYERS"] = "H5_ROOM_GET_PLAYERS";
	RundotGameMessageId["H5_ROOM_UPDATE_PLAYER_DATA"] = "H5_ROOM_UPDATE_PLAYER_DATA";
	RundotGameMessageId["H5_ROOM_START_GAME"] = "H5_ROOM_START_GAME";
	RundotGameMessageId["H5_ROOM_PROPOSE_MOVE"] = "h5:room:proposeMove";
	RundotGameMessageId["H5_ROOM_END_GAME"] = "H5_ROOM_END_GAME";
	RundotGameMessageId["H5_ROOM_KICK_PLAYER"] = "H5_ROOM_KICK_PLAYER";
	RundotGameMessageId["H5_ROOM_PROMOTE_TO_SPECTATOR"] = "H5_ROOM_PROMOTE_TO_SPECTATOR";
	RundotGameMessageId["H5_LOAD_EMBEDDED_ASSET"] = "H5_LOAD_EMBEDDED_ASSET";
	RundotGameMessageId["H5_LOAD_EMBEDDED_ASSET_BEGIN"] = "H5_LOAD_EMBEDDED_ASSET_BEGIN";
	RundotGameMessageId["H5_LOAD_EMBEDDED_ASSET_CHUNK"] = "H5_LOAD_EMBEDDED_ASSET_CHUNK";
	RundotGameMessageId["H5_SHOW_LOAD_SCREEN"] = "H5_SHOW_LOAD_SCREEN";
	RundotGameMessageId["H5_HIDE_LOAD_SCREEN"] = "H5_HIDE_LOAD_SCREEN";
	RundotGameMessageId["H5_SET_LOADER_TEXT"] = "H5_SET_LOADER_TEXT";
	RundotGameMessageId["H5_SET_LOADER_PROGRESS"] = "H5_SET_LOADER_PROGRESS";
	RundotGameMessageId["H5_IAP_OPEN_STORE"] = "H5_IAP_OPEN_STORE";
	RundotGameMessageId["H5_IAP_GET_CURRENCY_ICON"] = "H5_IAP_GET_CURRENCY_ICON";
	RundotGameMessageId["H5_UGC_CREATE"] = "H5_UGC_CREATE";
	RundotGameMessageId["H5_UGC_UPDATE"] = "H5_UGC_UPDATE";
	RundotGameMessageId["H5_UGC_DELETE"] = "H5_UGC_DELETE";
	RundotGameMessageId["H5_UGC_GET"] = "H5_UGC_GET";
	RundotGameMessageId["H5_UGC_LIST_MINE"] = "H5_UGC_LIST_MINE";
	RundotGameMessageId["H5_UGC_LIST_SHARED"] = "H5_UGC_LIST_SHARED";
	RundotGameMessageId["H5_UGC_LIST_MEMBERS"] = "H5_UGC_LIST_MEMBERS";
	RundotGameMessageId["H5_UGC_ADD_MEMBER"] = "H5_UGC_ADD_MEMBER";
	RundotGameMessageId["H5_UGC_REMOVE_MEMBER"] = "H5_UGC_REMOVE_MEMBER";
	RundotGameMessageId["H5_UGC_BROWSE"] = "H5_UGC_BROWSE";
	RundotGameMessageId["H5_UGC_LIKE"] = "H5_UGC_LIKE";
	RundotGameMessageId["H5_UGC_UNLIKE"] = "H5_UGC_UNLIKE";
	RundotGameMessageId["H5_UGC_RECORD_USE"] = "H5_UGC_RECORD_USE";
	RundotGameMessageId["H5_UGC_REPORT"] = "H5_UGC_REPORT";
	RundotGameMessageId["H5_UGC_GET_MANY"] = "H5_UGC_GET_MANY";
	RundotGameMessageId["H5_UGC_COUNT"] = "H5_UGC_COUNT";
	RundotGameMessageId["H5_UGC_FOLLOW"] = "H5_UGC_FOLLOW";
	RundotGameMessageId["H5_UGC_UNFOLLOW"] = "H5_UGC_UNFOLLOW";
	RundotGameMessageId["H5_UGC_IS_FOLLOWING"] = "H5_UGC_IS_FOLLOWING";
	RundotGameMessageId["H5_UGC_GET_FOLLOW_COUNTS"] = "H5_UGC_GET_FOLLOW_COUNTS";
	RundotGameMessageId["H5_UGC_VOTING_VOTE"] = "H5_UGC_VOTING_VOTE";
	RundotGameMessageId["H5_UGC_VOTING_UNVOTE"] = "H5_UGC_VOTING_UNVOTE";
	RundotGameMessageId["H5_UGC_VOTING_GET_MY_VOTES"] = "H5_UGC_VOTING_GET_MY_VOTES";
	RundotGameMessageId["H5_UGC_VOTING_GET_LEADERBOARD"] = "H5_UGC_VOTING_GET_LEADERBOARD";
	RundotGameMessageId["H5_UGC_VOTING_GET_WINNERS"] = "H5_UGC_VOTING_GET_WINNERS";
	RundotGameMessageId["H5_UGC_CROSS_APP_BROWSE"] = "H5_UGC_CROSS_APP_BROWSE";
	RundotGameMessageId["H5_UGC_CROSS_APP_GET"] = "H5_UGC_CROSS_APP_GET";
	RundotGameMessageId["H5_UGC_CROSS_APP_GET_MANY"] = "H5_UGC_CROSS_APP_GET_MANY";
	RundotGameMessageId["H5_UGC_CROSS_APP_COUNT"] = "H5_UGC_CROSS_APP_COUNT";
	RundotGameMessageId["H5_UGC_CROSS_APP_CREATE"] = "H5_UGC_CROSS_APP_CREATE";
	RundotGameMessageId["H5_UGC_CROSS_APP_UPDATE"] = "H5_UGC_CROSS_APP_UPDATE";
	RundotGameMessageId["H5_UGC_CROSS_APP_DELETE"] = "H5_UGC_CROSS_APP_DELETE";
	RundotGameMessageId["H5_UGC_GET_USER_RECOMMENDATION"] = "H5_UGC_GET_USER_RECOMMENDATION";
	RundotGameMessageId["H5_UGC_GET_ITEM_RECOMMENDATION"] = "H5_UGC_GET_ITEM_RECOMMENDATION";
	RundotGameMessageId["H5_UGC_GET_COMPOSITE_RECOMMENDATION"] = "H5_UGC_GET_COMPOSITE_RECOMMENDATION";
	RundotGameMessageId["H5_UGC_GET_MORE_RECOMMENDATIONS"] = "H5_UGC_GET_MORE_RECOMMENDATIONS";
	RundotGameMessageId["H5_UGC_ADD_DETAIL_VIEW"] = "H5_UGC_ADD_DETAIL_VIEW";
	RundotGameMessageId["H5_UGC_ADD_RATING"] = "H5_UGC_ADD_RATING";
	RundotGameMessageId["H5_UGC_ADD_CART_ADDITION"] = "H5_UGC_ADD_CART_ADDITION";
	RundotGameMessageId["H5_UGC_SET_VIEW_PORTION"] = "H5_UGC_SET_VIEW_PORTION";
	RundotGameMessageId["CLIPS_GET_CAPTURE_CONSENT"] = "H5_CLIPS_GET_CAPTURE_CONSENT";
	RundotGameMessageId["CLIPS_REQUEST_CAPTURE_CONSENT"] = "H5_CLIPS_REQUEST_CAPTURE_CONSENT";
	RundotGameMessageId["CLIPS_SET_CAPTURE_CONSENT"] = "H5_CLIPS_SET_CAPTURE_CONSENT";
	RundotGameMessageId["H5_IMAGE_GEN_GENERATE"] = "H5_IMAGE_GEN_GENERATE";
	RundotGameMessageId["H5_IMAGE_GEN_ESTIMATE_DEPTH"] = "H5_IMAGE_GEN_ESTIMATE_DEPTH";
	RundotGameMessageId["H5_IMAGE_GEN_REMOVE_BACKGROUND"] = "H5_IMAGE_GEN_REMOVE_BACKGROUND";
	RundotGameMessageId["H5_IMAGE_GEN_UPSCALE_IMAGE"] = "H5_IMAGE_GEN_UPSCALE_IMAGE";
	RundotGameMessageId["H5_IMAGE_GEN_LIST_MODELS"] = "H5_IMAGE_GEN_LIST_MODELS";
	RundotGameMessageId["H5_AUDIO_GEN_GENERATE"] = "H5_AUDIO_GEN_GENERATE";
	RundotGameMessageId["H5_AUDIO_GEN_LIST_VOICES"] = "H5_AUDIO_GEN_LIST_VOICES";
	RundotGameMessageId["H5_AUDIO_GEN_DESIGN_VOICES"] = "H5_AUDIO_GEN_DESIGN_VOICES";
	RundotGameMessageId["H5_AUDIO_GEN_SAVE_DESIGNED_VOICE"] = "H5_AUDIO_GEN_SAVE_DESIGNED_VOICE";
	RundotGameMessageId["H5_VIDEO_GEN_GENERATE"] = "H5_VIDEO_GEN_GENERATE";
	RundotGameMessageId["H5_VIDEO_GEN_CANCEL"] = "H5_VIDEO_GEN_CANCEL";
	RundotGameMessageId["H5_VIDEO_GEN_JOB_STARTED"] = "H5_VIDEO_GEN_JOB_STARTED";
	RundotGameMessageId["H5_FILES_UPLOAD"] = "H5_FILES_UPLOAD";
	RundotGameMessageId["H5_FILES_BATCH_UPLOAD"] = "H5_FILES_BATCH_UPLOAD";
	RundotGameMessageId["H5_FILES_BATCH_COPY"] = "H5_FILES_BATCH_COPY";
	RundotGameMessageId["H5_FILES_CONFIRM_UPLOAD"] = "H5_FILES_CONFIRM_UPLOAD";
	RundotGameMessageId["H5_FILES_BATCH_CONFIRM"] = "H5_FILES_BATCH_CONFIRM";
	RundotGameMessageId["H5_FILES_GET_URL"] = "H5_FILES_GET_URL";
	RundotGameMessageId["H5_FILES_GET_URLS"] = "H5_FILES_GET_URLS";
	RundotGameMessageId["H5_FILES_GET_METADATA"] = "H5_FILES_GET_METADATA";
	RundotGameMessageId["H5_FILES_EXISTS"] = "H5_FILES_EXISTS";
	RundotGameMessageId["H5_FILES_BATCH_METADATA"] = "H5_FILES_BATCH_METADATA";
	RundotGameMessageId["H5_FILES_BATCH_EXISTS"] = "H5_FILES_BATCH_EXISTS";
	RundotGameMessageId["H5_FILES_DELETE"] = "H5_FILES_DELETE";
	RundotGameMessageId["H5_FILES_LIST"] = "H5_FILES_LIST";
	RundotGameMessageId["H5_FILES_GET_QUOTA"] = "H5_FILES_GET_QUOTA";
	RundotGameMessageId["H5_FILES_SET_VISIBILITY"] = "H5_FILES_SET_VISIBILITY";
	RundotGameMessageId["H5_FILES_TRANSFORM"] = "H5_FILES_TRANSFORM";
	RundotGameMessageId["H5_FILES_EXPORT_CLOUDINARY"] = "H5_FILES_EXPORT_CLOUDINARY";
	RundotGameMessageId["H5_SPRITE_GEN_GENERATE"] = "H5_SPRITE_GEN_GENERATE";
	RundotGameMessageId["H5_SPRITE_GEN_ANIMATE"] = "H5_SPRITE_GEN_ANIMATE";
	RundotGameMessageId["H5_SPRITE_GEN_CHARACTER_ANIMATE"] = "H5_SPRITE_GEN_CHARACTER_ANIMATE";
	RundotGameMessageId["H5_SPRITE_GEN_LIST_CHARACTER_WORKFLOWS"] = "H5_SPRITE_GEN_LIST_CHARACTER_WORKFLOWS";
	RundotGameMessageId["H5_SPRITE_GEN_LIST_MODELS"] = "H5_SPRITE_GEN_LIST_MODELS";
	RundotGameMessageId["H5_SPRITE_GEN_GET_COSTS"] = "H5_SPRITE_GEN_GET_COSTS";
	RundotGameMessageId["H5_THREE_D_GEN_GENERATE"] = "H5_THREE_D_GEN_GENERATE";
	RundotGameMessageId["H5_THREE_D_GEN_REMESH"] = "H5_THREE_D_GEN_REMESH";
	RundotGameMessageId["H5_THREE_D_GEN_RIG"] = "H5_THREE_D_GEN_RIG";
	RundotGameMessageId["H5_THREE_D_GEN_ANIMATE"] = "H5_THREE_D_GEN_ANIMATE";
	RundotGameMessageId["H5_PROMPT_LOGIN"] = "H5_PROMPT_LOGIN";
	RundotGameMessageId["H5_ENTITLEMENT_LIST"] = "H5_ENTITLEMENT_LIST";
	RundotGameMessageId["H5_ENTITLEMENT_CONSUME"] = "H5_ENTITLEMENT_CONSUME";
	RundotGameMessageId["H5_ENTITLEMENT_GET_QUANTITY"] = "H5_ENTITLEMENT_GET_QUANTITY";
	RundotGameMessageId["H5_ENTITLEMENT_GET_LEDGER"] = "H5_ENTITLEMENT_GET_LEDGER";
	RundotGameMessageId["H5_CHOICES_GET_BALANCE"] = "H5_CHOICES_GET_BALANCE";
	RundotGameMessageId["H5_CHOICES_SPEND"] = "H5_CHOICES_SPEND";
	RundotGameMessageId["H5_STATS_SUBMIT_BATCH"] = "H5_STATS_SUBMIT_BATCH";
	RundotGameMessageId["H5_STATS_GET_VALUE"] = "H5_STATS_GET_VALUE";
	RundotGameMessageId["H5_STATS_GET_ALL"] = "H5_STATS_GET_ALL";
	RundotGameMessageId["H5_COLLECTIBLES_LIST_CARDS"] = "H5_COLLECTIBLES_LIST_CARDS";
	RundotGameMessageId["H5_COLLECTIBLES_VIP_CLAIM"] = "H5_COLLECTIBLES_VIP_CLAIM";
	RundotGameMessageId["H5_SHOP_GET_CATALOG"] = "H5_SHOP_GET_CATALOG";
	RundotGameMessageId["H5_SHOP_GET_ITEM_DETAIL"] = "H5_SHOP_GET_ITEM_DETAIL";
	RundotGameMessageId["H5_SHOP_PURCHASE"] = "H5_SHOP_PURCHASE";
	RundotGameMessageId["H5_SHOP_GET_ORDER_STATUS"] = "H5_SHOP_GET_ORDER_STATUS";
	RundotGameMessageId["H5_SHOP_GET_ORDER_HISTORY"] = "H5_SHOP_GET_ORDER_HISTORY";
	RundotGameMessageId["H5_SHOP_REQUEST_REFUND"] = "H5_SHOP_REQUEST_REFUND";
	RundotGameMessageId["H5_ASSET_LIBRARY_GET_PACK_BASE_URL"] = "H5_ASSET_LIBRARY_GET_PACK_BASE_URL";
	RundotGameMessageId["H5_CDN_RESOLVE_ASSET_URL"] = "H5_CDN_RESOLVE_ASSET_URL";
	RundotGameMessageId["H5_CDN_RESOLVE_ASSET_URLS"] = "H5_CDN_RESOLVE_ASSET_URLS";
	RundotGameMessageId["H5_CDN_REFRESH_ENTITLEMENTS"] = "H5_CDN_REFRESH_ENTITLEMENTS";
	RundotGameMessageId["H5_APP_GET_MY_ROLE"] = "H5_APP_GET_MY_ROLE";
	RundotGameMessageId["H5_GET_ATTRIBUTION_PARAMS"] = "H5_GET_ATTRIBUTION_PARAMS";
	RundotGameMessageId["H5_RESOLVE_LAUNCH_INTENT"] = "H5_RESOLVE_LAUNCH_INTENT";
	RundotGameMessageId["H5_APP_ADMIN_UGC_BROWSE"] = "H5_APP_ADMIN_UGC_BROWSE";
	RundotGameMessageId["H5_APP_ADMIN_UGC_REMOVE_ENTRY"] = "H5_APP_ADMIN_UGC_REMOVE_ENTRY";
	RundotGameMessageId["H5_APP_ADMIN_UGC_LIST_REPORTS"] = "H5_APP_ADMIN_UGC_LIST_REPORTS";
	RundotGameMessageId["H5_APP_ADMIN_UGC_RESOLVE_REPORT"] = "H5_APP_ADMIN_UGC_RESOLVE_REPORT";
	RundotGameMessageId["H5_APP_ADMIN_IMAGEGEN_BROWSE"] = "H5_APP_ADMIN_IMAGEGEN_BROWSE";
	RundotGameMessageId["H5_APP_ADMIN_IMAGEGEN_REMOVE_ENTRY"] = "H5_APP_ADMIN_IMAGEGEN_REMOVE_ENTRY";
	RundotGameMessageId["H5_APP_ADMIN_IMAGEGEN_LIST_REPORTS"] = "H5_APP_ADMIN_IMAGEGEN_LIST_REPORTS";
	RundotGameMessageId["H5_APP_ADMIN_IMAGEGEN_RESOLVE_REPORT"] = "H5_APP_ADMIN_IMAGEGEN_RESOLVE_REPORT";
	RundotGameMessageId["H5_APP_ADMIN_VIDEOGEN_BROWSE"] = "H5_APP_ADMIN_VIDEOGEN_BROWSE";
	RundotGameMessageId["H5_APP_ADMIN_VIDEOGEN_REMOVE_ENTRY"] = "H5_APP_ADMIN_VIDEOGEN_REMOVE_ENTRY";
	RundotGameMessageId["H5_APP_ADMIN_VIDEOGEN_LIST_REPORTS"] = "H5_APP_ADMIN_VIDEOGEN_LIST_REPORTS";
	RundotGameMessageId["H5_APP_ADMIN_VIDEOGEN_RESOLVE_REPORT"] = "H5_APP_ADMIN_VIDEOGEN_RESOLVE_REPORT";
	RundotGameMessageId["H5_APP_ADMIN_AUDIOGEN_BROWSE"] = "H5_APP_ADMIN_AUDIOGEN_BROWSE";
	RundotGameMessageId["H5_APP_ADMIN_AUDIOGEN_REMOVE_ENTRY"] = "H5_APP_ADMIN_AUDIOGEN_REMOVE_ENTRY";
	RundotGameMessageId["H5_APP_ADMIN_AUDIOGEN_LIST_REPORTS"] = "H5_APP_ADMIN_AUDIOGEN_LIST_REPORTS";
	RundotGameMessageId["H5_APP_ADMIN_AUDIOGEN_RESOLVE_REPORT"] = "H5_APP_ADMIN_AUDIOGEN_RESOLVE_REPORT";
	RundotGameMessageId["H5_APP_ADMIN_SPRITEGEN_BROWSE"] = "H5_APP_ADMIN_SPRITEGEN_BROWSE";
	RundotGameMessageId["H5_APP_ADMIN_SPRITEGEN_REMOVE_ENTRY"] = "H5_APP_ADMIN_SPRITEGEN_REMOVE_ENTRY";
	RundotGameMessageId["H5_APP_ADMIN_SPRITEGEN_LIST_REPORTS"] = "H5_APP_ADMIN_SPRITEGEN_LIST_REPORTS";
	RundotGameMessageId["H5_APP_ADMIN_SPRITEGEN_RESOLVE_REPORT"] = "H5_APP_ADMIN_SPRITEGEN_RESOLVE_REPORT";
	RundotGameMessageId["H5_APP_ADMIN_THREEDGEN_BROWSE"] = "H5_APP_ADMIN_THREEDGEN_BROWSE";
	RundotGameMessageId["H5_APP_ADMIN_THREEDGEN_REMOVE_ENTRY"] = "H5_APP_ADMIN_THREEDGEN_REMOVE_ENTRY";
	RundotGameMessageId["H5_APP_ADMIN_THREEDGEN_LIST_REPORTS"] = "H5_APP_ADMIN_THREEDGEN_LIST_REPORTS";
	RundotGameMessageId["H5_APP_ADMIN_THREEDGEN_RESOLVE_REPORT"] = "H5_APP_ADMIN_THREEDGEN_RESOLVE_REPORT";
	RundotGameMessageId["H5_REQUEST_JOIN_TICKET"] = "H5_REQUEST_JOIN_TICKET";
	RundotGameMessageId["H5_LIST_USER_REALTIME_ROOMS"] = "H5_LIST_USER_REALTIME_ROOMS";
	RundotGameMessageId["H5_VIDEO_REQUEST_PIP"] = "H5_VIDEO_REQUEST_PIP";
	RundotGameMessageId["H5_VIDEO_WEB_READY"] = "H5_VIDEO_WEB_READY";
	RundotGameMessageId["H5_VIDEO_RESUME_ACK"] = "H5_VIDEO_RESUME_ACK";
	RundotGameMessageId["H5_VIDEO_RESUME_FROM_NATIVE_PLAYBACK"] = "H5_VIDEO_RESUME_FROM_NATIVE_PLAYBACK";
	RundotGameMessageId["H5_SYSTEM_CAN_ADD_TO_HOME_SCREEN"] = "H5_SYSTEM_CAN_ADD_TO_HOME_SCREEN";
	RundotGameMessageId["H5_SYSTEM_ADD_TO_HOME_SCREEN"] = "H5_SYSTEM_ADD_TO_HOME_SCREEN";
	RundotGameMessageId["H5_SYSTEM_REQUEST_FULLSCREEN"] = "H5_SYSTEM_REQUEST_FULLSCREEN";
	RundotGameMessageId["H5_SYSTEM_EXIT_FULLSCREEN"] = "H5_SYSTEM_EXIT_FULLSCREEN";
	RundotGameMessageId["H5_SYSTEM_SET_POINTER_LOCK"] = "H5_SYSTEM_SET_POINTER_LOCK";
	RundotGameMessageId["H5_SYSTEM_GET_FULLSCREEN_STATE"] = "H5_SYSTEM_GET_FULLSCREEN_STATE";
	RundotGameMessageId["H5_SYSTEM_FULLSCREEN_STATE_CHANGED"] = "H5_SYSTEM_FULLSCREEN_STATE_CHANGED";
	RundotGameMessageId["H5_SYSTEM_POINTER_INPUT"] = "H5_SYSTEM_POINTER_INPUT";
	RundotGameMessageId["H5_SAFE_AREA_CHANGED"] = "H5_SAFE_AREA_CHANGED";
	RundotGameMessageId["H5_DEVICE_CHANGED"] = "H5_DEVICE_CHANGED";
	RundotGameMessageId["H5_POLL_COMPLETED_JOBS"] = "H5_POLL_COMPLETED_JOBS";
	RundotGameMessageId["ACTIVITY_START"] = "H5_ACTIVITY_START";
	RundotGameMessageId["ACTIVITY_UPDATE"] = "H5_ACTIVITY_UPDATE";
	RundotGameMessageId["ACTIVITY_END"] = "H5_ACTIVITY_END";
	RundotGameMessageId["ACTIVITY_ACTION"] = "ACTIVITY_ACTION";
	RundotGameMessageId["H5_PLAYABLE_CTA"] = "H5_PLAYABLE_CTA";
	RundotGameMessageId["H5_PLAYABLE_COMPLETE"] = "H5_PLAYABLE_COMPLETE";
	RundotGameMessageId["H5_PLAYABLE_MILESTONE"] = "H5_PLAYABLE_MILESTONE";
	RundotGameMessageId["HOST_FLUSH_STATE"] = "HOST_FLUSH_STATE";
	RundotGameMessageId["H5_FLUSH_STATE_ACK"] = "H5_FLUSH_STATE_ACK";
	return RundotGameMessageId;
}({});
//#endregion
//#region src/MockDebug.ts
/**
* Shared debug flag for all mock API implementations.
* Enable to trace mock API calls during local development:
*
*   import { MockDebug } from '@series-inc/rundot-game-sdk'
*   MockDebug.enabled = true
*/
const MockDebug = { enabled: false };
function mockLog(tag, message, ...args) {
	if (MockDebug.enabled) console.log(`[${tag}] ${message}`, ...args);
}
//#endregion
//#region src/ads/MockAdsApi.ts
const TAG$8 = "Mock Ads";
var MockAdsApi = class {
	mockOverlay;
	constructor(mockOverlay) {
		this.mockOverlay = mockOverlay;
	}
	async isRewardedAdReadyAsync() {
		mockLog(TAG$8, "isRewardedAdReadyAsync → true");
		await createMockDelay(MOCK_DELAYS.short);
		return true;
	}
	async isInterstitialAdReadyAsync() {
		mockLog(TAG$8, "isInterstitialAdReadyAsync → true");
		await createMockDelay(MOCK_DELAYS.short);
		return true;
	}
	async showRewardedAdAsync(options) {
		mockLog(TAG$8, "showRewardedAdAsync");
		await this.mockOverlay.showAdOverlay("rewarded", options);
		return true;
	}
	async showInterstitialAd(options) {
		mockLog(TAG$8, "showInterstitialAd");
		await this.mockOverlay.showAdOverlay("interstitial", options);
		return true;
	}
};
//#endregion
//#region src/ai/AiApi.ts
/**
* Builds the wire object for a templated prompt call explicitly (never
* spreads the caller's object) so only the templated-call fields ride the
* wire. Shared by every AiApi transport.
*/
function toPromptWireRequest(request) {
	return {
		promptId: request.promptId,
		input: request.input
	};
}
//#endregion
//#region src/ai/canvasUtils.ts
/**
* Recursively scans state and serializes any HTMLCanvasElement instances
* into data URL strings ("image/jpeg", 0.85).
*/
function serializeCanvasInState(state) {
	if (state === null || state === void 0) return state;
	if (typeof HTMLCanvasElement !== "undefined" && state instanceof HTMLCanvasElement) return state.toDataURL("image/jpeg", .85);
	if (Array.isArray(state)) return state.map((item) => serializeCanvasInState(item));
	if (typeof state === "object") {
		const result = {};
		for (const [key, value] of Object.entries(state)) result[key] = serializeCanvasInState(value);
		return result;
	}
	return state;
}
//#endregion
//#region src/assetLibrary/AssetLibraryApi.ts
/**
* Fallback base for the shared asset-library CDN, used when no host is present
* (studio preview, playground) or the host predates the assetLibrary RPC.
* Mirrors ASSET_CDN_BASE in studio/packages/shared/src/wire.ts, which the SDK
* cannot import — keep the two in sync.
*/
const DEFAULT_ASSET_LIBRARY_BASE_URL = "https://storage.googleapis.com/run-asset-library";
/**
* The default URL prefix for a pinned asset-pack version. Shared by the mock
* and the RPC fallback so both hostless paths produce identical URLs.
*/
function defaultPackBaseUrl(packId, version) {
	return `${DEFAULT_ASSET_LIBRARY_BASE_URL}/packs/${packId}@${version}`;
}
//#endregion
//#region src/assetLibrary/MockAssetLibraryApi.ts
var MockAssetLibraryApi = class {
	rundotGameApi;
	constructor(rundotGameApi) {
		this.rundotGameApi = rundotGameApi;
	}
	async getPackBaseUrl(packId, version) {
		return defaultPackBaseUrl(packId, version);
	}
	async loadAssetsBundle(game, bundleKey, fileType = "stow") {
		return await (await this.rundotGameApi.cdn.fetchFromCdn(`${game}/${bundleKey}.${fileType}`)).arrayBuffer();
	}
};
//#endregion
//#region src/analytics/MockAnalyticsApi.ts
var MockAnalyticsApi = class {
	async recordCustomEvent(eventName, payload) {
		await createMockDelay(MOCK_DELAYS.short);
	}
	async trackFunnelStep(stepNumber, stepName, funnelName, funnelOrder) {
		await createMockDelay(MOCK_DELAYS.short);
	}
};
//#endregion
//#region src/avatar3d/MockAvatarApi.ts
/**
* @deprecated The 3D Avatar system is deprecated and will be removed in a future release.
*/
var MockAvatarApi = class {
	_rundotGameApi;
	cachedAssets = null;
	cachedVersion = "";
	constructor(rundotGameApi) {
		this._rundotGameApi = rundotGameApi;
	}
	downloadAssetPaths() {
		return this.getAllAssetPaths();
	}
	async deleteAvatar() {
		const profileId = this._rundotGameApi.getProfile()?.id || "default_profile";
		localStorage.removeItem(`rundot-game-mock-avatar3d-${profileId}`);
	}
	async loadAvatar(avatar3dId) {
		const rundotGameApi = this._rundotGameApi;
		let config;
		if (avatar3dId) config = await this.selectAvatarConfig(avatar3dId, false);
		else {
			const profileId = rundotGameApi.getProfile()?.id || "default_profile";
			if (profileId === "default_profile") config = await this.selectAvatarConfig(null, true);
			else config = await this.selectAvatarConfig(profileId, false);
		}
		return config || null;
	}
	async saveAvatar(config) {
		const profileId = this._rundotGameApi.getProfile()?.id || "default_profile";
		localStorage.setItem(`rundot-game-mock-avatar3d-${profileId}`, JSON.stringify(config));
		return `mock_avatar3d_${profileId}_${Date.now()}`;
	}
	downloadManifest() {
		return this.loadAssetsManifest();
	}
	async showEditor(options) {
		if (window.RundotGamePrototyping) return new Promise((resolve) => {
			window.RundotGamePrototyping.showAvatarEditorOverlay(options, resolve);
		});
		await createMockDelay(MOCK_DELAYS.medium);
		const mockAvatarConfig = await this.selectAvatarConfig(null, false);
		if (Math.random() > .3) return {
			wasChanged: true,
			config: mockAvatarConfig,
			savedAvatarId: `mock_avatar_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
		};
		else return {
			wasChanged: false,
			config: null,
			savedAvatarId: null
		};
	}
	async getAssets() {
		let cachedAssets = this.cachedAssets;
		if (!cachedAssets) cachedAssets = (await this.loadAssetsManifest()).categories;
		return cachedAssets;
	}
	async loadAssetsManifest() {
		const baseManifestUrl = this._rundotGameApi.cdn.resolveAvatarAssetUrl("assets.json");
		const manifestUrl = `${baseManifestUrl}${baseManifestUrl.includes("?") ? "&" : "?"}v=${Date.now()}`;
		try {
			const response = await fetch(manifestUrl, {
				method: "GET",
				headers: {
					Accept: "application/json, text/plain, */*",
					"Content-Type": "application/json"
				},
				mode: "cors",
				cache: "no-cache"
			});
			if (!response.ok) throw new Error(`Failed to fetch assets manifest: ${response.status} ${response.statusText}`);
			const manifest = await response.json();
			this.cachedAssets = manifest.categories || {};
			this.cachedVersion = manifest.version;
			return manifest;
		} catch (error) {
			console.error("[RUN:mock] Failed to load assets manifest:", error);
			console.warn("[RUN:mock] Using fallback minimal manifest for development");
			const fallbackManifest = {
				version: "dev-fallback",
				generatedAt: (/* @__PURE__ */ new Date()).toISOString(),
				categories: {
					head: {
						type: "mesh",
						assets: [{
							id: "head_default",
							filename: "head_default.glb",
							displayName: "Default Head"
						}, {
							id: "head_variant1",
							filename: "head_variant1.glb",
							displayName: "Head Variant 1"
						}]
					},
					outfit: {
						type: "mesh",
						assets: [{
							id: "outfit_default",
							filename: "outfit_default.glb",
							displayName: "Default Outfit"
						}, {
							id: "outfit_casual",
							filename: "outfit_casual.glb",
							displayName: "Casual Outfit"
						}]
					},
					hat: {
						type: "mesh",
						assets: [{
							id: "hat_none",
							filename: "hat_none.glb",
							displayName: "No Hat"
						}, {
							id: "hat_cap",
							filename: "hat_cap.glb",
							displayName: "Baseball Cap"
						}]
					},
					hair: {
						type: "mesh",
						assets: [{
							id: "hair_default",
							filename: "hair_default.glb",
							displayName: "Default Hair"
						}, {
							id: "hair_long",
							filename: "hair_long.glb",
							displayName: "Long Hair"
						}]
					},
					"face-accessory": {
						type: "mesh",
						assets: [{
							id: "glasses_none",
							filename: "glasses_none.glb",
							displayName: "No Glasses"
						}, {
							id: "glasses_regular",
							filename: "glasses_regular.glb",
							displayName: "Regular Glasses"
						}]
					},
					animation: {
						type: "mesh",
						assets: [{
							id: "idle_default",
							filename: "idle_default.glb",
							displayName: "Default Idle"
						}, {
							id: "wave",
							filename: "wave.glb",
							displayName: "Wave Animation"
						}]
					}
				}
			};
			this.cachedAssets = fallbackManifest.categories;
			this.cachedVersion = fallbackManifest.version;
			return fallbackManifest;
		}
	}
	async selectAvatarConfig(avatarId = null, useDefaults = false) {
		const categories = await this.getAssets();
		const rng = avatarId ? this.seededRandom(avatarId) : () => Math.random();
		const headAsset = this.selectAsset(categories, "head", rng, avatarId, useDefaults);
		const outfitAsset = this.selectAsset(categories, "outfit", rng, avatarId, useDefaults);
		const hatAsset = this.selectAsset(categories, "hat", rng, avatarId, useDefaults);
		const hairAsset = this.selectAsset(categories, "hair", rng, avatarId, useDefaults);
		const faceAccessoryAsset = this.selectAsset(categories, "face-accessory", rng, avatarId, useDefaults);
		const animationAsset = this.selectAsset(categories, "animation", rng, avatarId, useDefaults);
		return {
			headAsset: headAsset.filename,
			outfitAsset: outfitAsset.filename,
			animationAsset: animationAsset.filename,
			faceAccessoryAsset: faceAccessoryAsset.filename,
			hairAsset: hairAsset.filename,
			hatAsset: hatAsset.filename,
			skinColor: null
		};
	}
	selectAsset(manifest, categoryId, rng, avatarId, useDefaults = false) {
		const categoryAssets = manifest[categoryId].assets;
		if (useDefaults) return categoryAssets[0];
		if (avatarId) return categoryAssets[Math.floor(rng() * categoryAssets.length)];
		return categoryAssets[0];
	}
	seededRandom(seed) {
		let state = this.simpleHash(seed);
		return function() {
			state = (state * 1664525 + 1013904223) % 4294967296;
			return state / 4294967296;
		};
	}
	simpleHash(str) {
		let hash = 0;
		for (let i = 0; i < str.length; i++) {
			const char = str.charCodeAt(i);
			hash = (hash << 5) - hash + char;
			hash = hash & hash;
		}
		return Math.abs(hash);
	}
	async getAllAssetPaths() {
		const rundotGameApi = this._rundotGameApi;
		const assets = await this.getAssets();
		const allPaths = {};
		for (const [category, categoryData] of Object.entries(assets)) allPaths[category] = (categoryData?.assets || []).map((asset) => rundotGameApi.cdn.resolveAvatarAssetUrl(`${category}/${asset.filename}`));
		return allPaths;
	}
};
//#endregion
//#region src/cdn/BaseCdnApi.ts
/**
* Base class for CDN API implementations with shared utility methods
*/
var BaseCdnApi = class BaseCdnApi {
	static AVATAR_ASSETS_PREFIX = "avatar3d";
	static SHARED_LIBS_PREFIX = "libs";
	/**
	* Remove leading slash from subPath
	*/
	cleanSubPath(subPath) {
		return subPath.startsWith("/") ? subPath.slice(1) : subPath;
	}
	/**
	* Encode path parts - only encode the filename (last part) to preserve directory structure
	*/
	encodePathParts(subPath) {
		const pathParts = subPath.split("/");
		return pathParts.map((part, index) => {
			return index === pathParts.length - 1 ? encodeURIComponent(part) : part;
		}).join("/");
	}
	/**
	* Check if subPath is already a full URL
	*/
	isFullUrl(subPath) {
		return subPath.startsWith("http://") || subPath.startsWith("https://");
	}
	/**
	* Normalize base URL to not end with trailing slash
	*/
	normalizeBaseUrl(url) {
		return url.endsWith("/") ? url.slice(0, -1) : url;
	}
	/**
	* Build full URL with encoding
	*/
	buildCdnUrl(subPath, baseUrl) {
		const cleanSubPath = this.cleanSubPath(subPath);
		return `${baseUrl}/${this.encodePathParts(cleanSubPath)}`;
	}
	/**
	* Execute a fetch request with timeout handling
	*/
	async executeFetch(url, options) {
		const controller = new AbortController();
		const timeoutMs = options?.timeout ?? 3e4;
		const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
		try {
			const response = await fetch(url, {
				mode: "cors",
				credentials: "omit",
				headers: { Accept: "*/*" },
				signal: controller.signal
			});
			clearTimeout(timeoutId);
			if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
			return await response.blob();
		} catch (error) {
			clearTimeout(timeoutId);
			throw error;
		}
	}
	getAssetCdnBaseUrl() {
		return this.getCdnAssetsBaseUrl();
	}
	async resolveAssetUrl(subPath) {
		return this.buildCdnUrl(subPath, this.getCdnAssetsBaseUrl());
	}
	/** @deprecated 3D Avatar system is deprecated */
	resolveAvatarAssetUrl(subPath) {
		if (this.isFullUrl(subPath)) return subPath;
		return this.buildCdnUrl(`${BaseCdnApi.AVATAR_ASSETS_PREFIX}/${subPath}`, this.getSharedAssetsCdnBaseUrl());
	}
	resolveSharedLibUrl(subPath) {
		if (this.isFullUrl(subPath)) return subPath;
		return this.buildCdnUrl(`${BaseCdnApi.SHARED_LIBS_PREFIX}/${subPath}`, this.getSharedAssetsCdnBaseUrl());
	}
	async resolveAssetUrls(subPaths) {
		return await Promise.all(subPaths.map(async (p) => {
			try {
				return {
					path: p,
					status: "ok",
					url: await this.resolveAssetUrl(p)
				};
			} catch {
				return {
					path: p,
					status: "error",
					error: "ASSET_NOT_FOUND"
				};
			}
		}));
	}
	async refreshEntitlements() {}
};
//#endregion
//#region src/cdn/MockCdnApi.ts
/**
* CDN API implementation for mock/development environments.
* Serves assets from the public/cdn-assets folder via Vite dev server.
*/
var MockCdnApi = class MockCdnApi extends BaseCdnApi {
	static LEGACY_CDN_PREFIX = "cdn/";
	static SHARED_ASSETS_CDN_BASE = "https://venus-static-01293ak.web.app";
	rundotGameApi;
	constructor(rundotGameApi) {
		super();
		this.rundotGameApi = rundotGameApi;
	}
	getCdnAssetsBaseUrl() {
		return "cdn-assets";
	}
	getCdnBaseUrl() {
		return MockCdnApi.SHARED_ASSETS_CDN_BASE;
	}
	getSharedAssetsCdnBaseUrl() {
		return "";
	}
	async resolveAssetUrl(subPath) {
		if (this.isFullUrl(subPath)) return subPath;
		if (subPath.startsWith(MockCdnApi.LEGACY_CDN_PREFIX)) return subPath;
		return this.buildCdnUrl(subPath, this.getCdnAssetsBaseUrl());
	}
	/**
	* Fetch an asset directly from the bucket root (public folder root in mock mode).
	* This mimics production behavior where cross-game assets are at the bucket root.
	*
	* @param subPath - The path relative to public folder root (e.g., "othergame/bundle.stow")
	* @param options - Optional fetch options including timeout
	* @returns Promise<Blob> - The asset data as a Blob
	*
	* @example
	* // In mock mode with public folder structure:
	* // fetchFromCdn("othergame/bundle.stow")
	* // → othergame/bundle.stow (from public root, not public/cdn-assets)
	*/
	async fetchFromCdn(subPath, options) {
		const cleanSubPath = subPath.startsWith("/") ? subPath.slice(1) : subPath;
		const encodedSubPath = this.encodePathParts(cleanSubPath);
		return this.executeFetch(encodedSubPath, options);
	}
	/**
	* Fetch an asset in mock/development mode.
	* In development, assets are served directly without manifest transformation,
	* so this method fetches from the cdn-assets folder.
	*
	* @param relativePath - The path to the asset (e.g., "/some/asset.png" or "some/asset.png")
	* @param options - Optional fetch options including timeout
	* @returns Promise<Blob> - The asset data as a Blob
	*/
	async fetchAsset(relativePath, options) {
		const fullPath = `cdn-assets/${relativePath.startsWith("/") ? relativePath.slice(1) : relativePath}`;
		return this.fetchFromCdn(fullPath, options);
	}
};
//#endregion
//#region src/device/MockDeviceApi.ts
var MockDeviceApi = class {
	rundotGameApi;
	constructor(rundotGameApi) {
		this.rundotGameApi = rundotGameApi;
	}
	getDevice() {
		const width = typeof window !== "undefined" ? window.innerWidth : 400;
		const height = typeof window !== "undefined" ? window.innerHeight : 800;
		const device = {
			screenSize: {
				width,
				height
			},
			viewportSize: {
				width: width - 20,
				height: height - 20
			},
			orientation: width > height ? "landscape" : "portrait",
			pixelRatio: typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1,
			fontScale: 1,
			deviceType: Math.min(width, height) >= 600 ? "tablet" : "phone",
			hapticsEnabled: false,
			haptics: {
				supported: false,
				enabled: false
			}
		};
		this.rundotGameApi._deviceData = device;
		if (this.rundotGameApi._mock) this.rundotGameApi._mock.device = device;
		return device;
	}
};
//#endregion
//#region src/environment/MockEnvironmentApi.ts
var MockEnvironmentApi = class {
	rundotGameApi;
	constructor(rundotGameApi) {
		this.rundotGameApi = rundotGameApi;
	}
	getEnvironment() {
		const getBrowser = () => {
			if (typeof navigator === "undefined") return "unknown";
			const userAgent = navigator.userAgent;
			if (/chrome|chromium|crios/i.test(userAgent)) return "chrome";
			if (/firefox|fxios/i.test(userAgent)) return "firefox";
			if (/safari/i.test(userAgent)) return "safari";
			if (/edg/i.test(userAgent)) return "edge";
			if (/opera|opr/i.test(userAgent)) return "opera";
			return "unknown";
		};
		return {
			isDevelopment: true,
			platform: "web",
			platformVersion: "mock-1.0",
			browserInfo: {
				browser: getBrowser(),
				userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "mock-agent",
				isMobile: typeof navigator !== "undefined" ? /Mobi|Android/i.test(navigator.userAgent) : false,
				isTablet: typeof navigator !== "undefined" ? /iPad|Tablet|Pad/i.test(navigator.userAgent) : false,
				language: typeof navigator !== "undefined" ? navigator.language || "en-US" : "en-US"
			},
			capabilities: {
				ads: true,
				purchases: true,
				subscriptions: true,
				fullscreen: "unavailable",
				pointerLock: false,
				cta: false,
				persistence: "cloud",
				online: true
			},
			isSteamDesktop: false,
			isSteamDeck: false,
			executionMode: "full"
		};
	}
};
//#endregion
//#region src/system/MockSystemApi.ts
/**
* Mock implementation of SystemApi for local development.
* Delegates to mock device and environment APIs.
*/
var MockSystemApi = class {
	deviceApi;
	environmentApi;
	rundotGameAPI;
	constructor(deviceApi, environmentApi, rundotGameApi) {
		this.deviceApi = deviceApi;
		this.environmentApi = environmentApi;
		this.rundotGameAPI = rundotGameApi;
	}
	getDevice() {
		return this.deviceApi.getDevice();
	}
	getEnvironment() {
		return this.environmentApi.getEnvironment();
	}
	getSafeArea() {
		const safeArea = this.rundotGameAPI._safeAreaData;
		if (!safeArea) return {
			top: 0,
			right: 0,
			bottom: 34,
			left: 0
		};
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
		return false;
	}
	async addToHomeScreen() {
		return { added: false };
	}
	async requestFullscreen(_options = {}) {
		return {
			active: false,
			pointerLocked: false
		};
	}
	async exitFullscreen() {
		return {
			active: false,
			pointerLocked: false
		};
	}
	async setPointerLock(_locked) {
		return {
			active: false,
			pointerLocked: false,
			reason: "unsupported"
		};
	}
	canFullscreen() {
		return this.getEnvironment().capabilities?.fullscreen === "toggleable";
	}
	async getFullscreenState() {
		return {
			active: false,
			pointerLocked: false
		};
	}
	onFullscreenStateChange(_listener) {
		return () => {};
	}
	onPointerInput(_listener) {
		return () => {};
	}
};
//#endregion
//#region src/system/safeAreaReplica.ts
/**
* Validates and coerces safe area insets into non-negative finite numbers.
*/
function sanitizeSafeArea(raw) {
	return {
		top: typeof raw?.top === "number" && Number.isFinite(raw.top) && raw.top >= 0 ? raw.top : 0,
		right: typeof raw?.right === "number" && Number.isFinite(raw.right) && raw.right >= 0 ? raw.right : 0,
		bottom: typeof raw?.bottom === "number" && Number.isFinite(raw.bottom) && raw.bottom >= 0 ? raw.bottom : 0,
		left: typeof raw?.left === "number" && Number.isFinite(raw.left) && raw.left >= 0 ? raw.left : 0
	};
}
/**
* Injects CSS custom properties on document.documentElement (:root) so web games
* can style layout with standard CSS variables:
*   --rundot-safe-area-top
*   --rundot-safe-area-right
*   --rundot-safe-area-bottom
*   --rundot-safe-area-left
*/
function applySafeAreaCssVariables(safeArea) {
	if (typeof document !== "undefined" && document.documentElement?.style) {
		const style = document.documentElement.style;
		style.setProperty("--rundot-safe-area-top", `${safeArea.top}px`);
		style.setProperty("--rundot-safe-area-right", `${safeArea.right}px`);
		style.setProperty("--rundot-safe-area-bottom", `${safeArea.bottom}px`);
		style.setProperty("--rundot-safe-area-left", `${safeArea.left}px`);
	}
}
/**
* Single write path for safe area replica:
* 1. Validates and sanitizes insets
* 2. Updates `rundotGameApi._safeAreaData`
* 3. Injects CSS custom properties
*/
function applySafeAreaUpdate(rundotGameApi, raw) {
	const safeArea = sanitizeSafeArea(raw);
	rundotGameApi._safeAreaData = safeArea;
	applySafeAreaCssVariables(safeArea);
	return safeArea;
}
//#endregion
//#region src/features/MockFeaturesApi.ts
var MockFeaturesApi = class {
	async getExperiment(experimentName) {
		return null;
	}
	async getFeatureFlag(flagName) {
		return Promise.resolve(false);
	}
	getFeatureGate(gateName) {
		return Promise.resolve(false);
	}
};
//#endregion
//#region src/liveops/resolveLiveOps.ts
function windowContains(window, nowMs) {
	if (window.activeAt !== void 0) {
		const start = Date.parse(window.activeAt);
		if (Number.isNaN(start) || nowMs < start) return false;
	}
	if (window.expiresAt !== void 0) {
		const end = Date.parse(window.expiresAt);
		if (Number.isNaN(end) || nowMs >= end) return false;
	}
	return true;
}
/** Degrade-not-throw: a non-array section field (hand-written/legacy data) must
*  resolve to "empty", never make `for...of` / spread throw TypeError. */
function asArray(value) {
	return Array.isArray(value) ? value : [];
}
function hasUnparseableDate(window) {
	return window.activeAt !== void 0 && Number.isNaN(Date.parse(window.activeAt)) || window.expiresAt !== void 0 && Number.isNaN(Date.parse(window.expiresAt));
}
/**
* Earliest future boundary (activeAt or expiresAt strictly after now) across all
* overrides and experiments with parseable dates, or null. Skipped/bad-date
* entries contribute none.
*/
function computeNextChangeAt(section, nowMs) {
	let next = null;
	const windows = [...asArray(section?.overrides), ...asArray(section?.experiments)];
	for (const window of windows) for (const raw of [window.activeAt, window.expiresAt]) {
		if (raw === void 0) continue;
		const t = Date.parse(raw);
		if (Number.isNaN(t) || t <= nowMs) continue;
		if (next === null || t < next) next = t;
	}
	return next;
}
/** FNV-1a 32-bit. Stable, portable; do not change without re-shuffling every live experiment. */
function fnv1a32(input) {
	let hash = 2166136261;
	for (let i = 0; i < input.length; i++) {
		hash ^= input.charCodeAt(i);
		hash = Math.imul(hash, 16777619) >>> 0;
	}
	return hash >>> 0;
}
const BUCKET_COUNT = 1e4;
/** Double-hash into [0, BUCKET_COUNT). The double pass is load-bearing: bit 0 of a
*  single fnv1a32 is a parity function of the input chars (odd-char XOR flips it,
*  odd-prime multiply preserves it), so `hash % 2` gave every 50/50 experiment the
*  same global player split (verified: 0%/100% cross-experiment agreement). Hashing
*  the first hash's decimal string breaks that structure (cf. GrowthBook hashVersion 2).
*  Do not change without re-shuffling every live experiment. */
function assignmentBucket(seed, unitId) {
	return fnv1a32(String(fnv1a32(`${seed}:${unitId}`))) % BUCKET_COUNT;
}
/** Pure deterministic assignment; null on malformed input (degrade-not-throw).
*  Variants own contiguous bucket ranges in array order, boundaries scaled to
*  BUCKET_COUNT, so a constant-total weight edit moves only the boundaries,
*  which is what makes the documented ramp recipe safe. */
function assignVariant(experiment, unitId) {
	const variants = Array.isArray(experiment.variants) ? experiment.variants : [];
	if (experiment.forceVariant !== void 0) {
		const forced = variants.find((v) => v.id === experiment.forceVariant);
		return forced ? {
			variant: forced,
			totalWeight: 0
		} : null;
	}
	if (variants.length < 2) return null;
	let total = 0;
	for (const v of variants) {
		if (typeof v.weight !== "number" || !Number.isInteger(v.weight) || v.weight < 1) return null;
		total += v.weight;
	}
	if (total < 1 || total > 1e4) return null;
	const bucket = assignmentBucket(experiment.salt ?? experiment.id, unitId);
	let cumulative = 0;
	for (const v of variants) {
		cumulative += v.weight;
		if (bucket < Math.floor(1e4 * cumulative / total)) return {
			variant: v,
			totalWeight: total
		};
	}
	return null;
}
/**
* Resolve a LiveOps `client` section against a caller-supplied clock. Pure: never
* reads an ambient clock (`nowMs` is server-anchored in the SDK real paths,
* `Date.now()` in Mock, UTC now in the CLI preview). Purity is load-bearing — the
* MP authority resolves once at match start with a frozen timestamp.
*/
function resolveLiveOpsSection(section, nowMs, unitId) {
	const values = { ...section?.values ?? {} };
	const activeOverrideIds = [];
	for (const override of asArray(section?.overrides)) {
		if (hasUnparseableDate(override) || !windowContains(override, nowMs)) continue;
		Object.assign(values, override.values);
		activeOverrideIds.push(override.id);
	}
	const assignments = [];
	if (unitId !== void 0 && unitId !== "") for (const experiment of asArray(section?.experiments)) {
		if (hasUnparseableDate(experiment) || !windowContains(experiment, nowMs)) continue;
		const assigned = assignVariant(experiment, unitId);
		if (assigned === null || typeof experiment.id !== "string" || experiment.id === "") continue;
		Object.assign(values, assigned.variant.values ?? {});
		assignments.push({
			experimentId: experiment.id,
			variantId: assigned.variant.id,
			variantWeight: assigned.variant.weight,
			totalWeight: assigned.totalWeight
		});
	}
	return {
		values,
		activeOverrideIds,
		assignments,
		nextChangeAt: computeNextChangeAt(section, nowMs)
	};
}
//#endregion
//#region src/liveops/LiveOpsCache.ts
/**
* Once-per-(unit, experiment, variant) gate shared by the cache and the mock API.
* Keyed on unitId so a mid-session identity change re-logs for the new profile.
*/
var ExposureDeduper = class {
	onExposure;
	seen = /* @__PURE__ */ new Set();
	constructor(onExposure) {
		this.onExposure = onExposure;
	}
	record(unitId, assignments, configVersion) {
		if (!this.onExposure) return;
		for (const a of assignments) {
			const key = `${unitId} ${a.experimentId} ${a.variantId}`;
			if (this.seen.has(key)) continue;
			this.seen.add(key);
			try {
				this.onExposure(a, configVersion);
			} catch {}
		}
	}
};
const DEFAULT_MAX_AGE_MS = 6e4;
/**
* Shared rule cache + server-anchored resolution used by both network impls
* (Http/Rpc). Caches the raw client rules + the server clock stamp + local fetch
* time; re-resolves on every read against `serverTimeMs + elapsed-local`, so a
* scheduled flip is always live even while the rules stay cached.
*/
var LiveOpsCache = class {
	fetchRaw;
	hooks;
	entry = null;
	deduper;
	constructor(fetchRaw, hooks) {
		this.fetchRaw = fetchRaw;
		this.hooks = hooks;
		this.deduper = new ExposureDeduper(hooks?.onExposure);
	}
	clear() {
		this.entry = null;
	}
	async ensureFresh(maxAgeMs) {
		const now = Date.now();
		if (this.entry && maxAgeMs > 0 && now - this.entry.fetchedAtLocalMs < maxAgeMs) return this.entry;
		const raw = await this.fetchRaw();
		this.entry = {
			raw,
			fetchedAtLocalMs: Date.now()
		};
		return this.entry;
	}
	/** server-anchored now: server clock at fetch + elapsed local time since. */
	effectiveNow(entry) {
		return entry.raw.serverTimeMs + (Date.now() - entry.fetchedAtLocalMs);
	}
	async getConfig(maxAgeMs = DEFAULT_MAX_AGE_MS) {
		const entry = await this.ensureFresh(maxAgeMs);
		const unitId = this.hooks?.getUnitId?.();
		const resolved = resolveLiveOpsSection(entry.raw.client ?? void 0, this.effectiveNow(entry), unitId);
		if (unitId !== void 0) this.deduper.record(unitId, resolved.assignments, entry.raw.configVersion);
		return {
			...resolved,
			configVersion: entry.raw.configVersion
		};
	}
	async getRaw(maxAgeMs = DEFAULT_MAX_AGE_MS) {
		const entry = await this.ensureFresh(maxAgeMs);
		return {
			values: entry.raw.client?.values ?? {},
			overrides: entry.raw.client?.overrides ?? [],
			experiments: entry.raw.client?.experiments ?? [],
			configVersion: entry.raw.configVersion,
			serverTimeMs: entry.raw.serverTimeMs
		};
	}
};
//#endregion
//#region src/haptics/MockHapticsApi.ts
var MockHapticsApi = class {
	rundotGameApi;
	constructor(rundotGameApi) {
		this.rundotGameApi = rundotGameApi;
	}
	async triggerHapticAsync(style) {
		if (!this.rundotGameApi._mock.device.supportsHaptics) return;
	}
};
//#endregion
//#region src/gamepad/GamepadApi.ts
const GAMEPAD_BUTTON_NAMES = [
	"a",
	"b",
	"x",
	"y",
	"leftBumper",
	"rightBumper",
	"leftTrigger",
	"rightTrigger",
	"select",
	"start",
	"guide",
	"leftStick",
	"rightStick",
	"dpadUp",
	"dpadDown",
	"dpadLeft",
	"dpadRight"
];
//#endregion
//#region src/gamepad/WebGamepadReader.ts
/**
* W3C standard-mapping button order (indices into `Gamepad.buttons`). `null`
* slots are reserved/unused in the standard layout.
* https://www.w3.org/TR/gamepad/#remapping
*/
const STANDARD_BUTTON_ORDER = [
	"a",
	"b",
	"x",
	"y",
	"leftBumper",
	"rightBumper",
	"leftTrigger",
	"rightTrigger",
	"select",
	"start",
	"leftStick",
	"rightStick",
	"dpadUp",
	"dpadDown",
	"dpadLeft",
	"dpadRight",
	"guide"
];
function nowMs() {
	return typeof performance !== "undefined" && typeof performance.now === "function" ? performance.now() : Date.now();
}
function finiteOr(value, fallback) {
	return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}
function clamp(value, min, max) {
	return Math.min(max, Math.max(min, value));
}
function emptyButtons() {
	const buttons = {};
	for (const name of GAMEPAD_BUTTON_NAMES) buttons[name] = {
		pressed: false,
		value: 0
	};
	return buttons;
}
function canReadWebGamepads() {
	if (typeof navigator === "undefined" || typeof navigator.getGamepads !== "function") return false;
	try {
		navigator.getGamepads();
		return true;
	} catch {
		return false;
	}
}
/**
* Maps a browser standard-mapping `Gamepad` to the normalized `GamepadSnapshot`.
* Bounds-checks `buttons`/`axes` so a short/garbage array yields zeros rather
* than throwing (MUST-26). `sampledAt` stamps both timestamps equal — Tier 1
* adds no transport latency.
*/
function normalizeStandardGamepad(pad, sampledAt) {
	const buttons = emptyButtons();
	const padButtons = pad.buttons ?? [];
	STANDARD_BUTTON_ORDER.forEach((name, index) => {
		if (name === null) return;
		const button = padButtons[index];
		if (!button) return;
		const pressed = Boolean(button.pressed);
		buttons[name] = {
			pressed,
			value: clamp(finiteOr(button.value, pressed ? 1 : 0), 0, 1)
		};
	});
	const padAxes = pad.axes ?? [];
	const axes = {
		leftX: clamp(finiteOr(padAxes[0], 0), -1, 1),
		leftY: clamp(finiteOr(padAxes[1], 0), -1, 1),
		rightX: clamp(finiteOr(padAxes[2], 0), -1, 1),
		rightY: clamp(finiteOr(padAxes[3], 0), -1, 1)
	};
	return {
		index: pad.index,
		id: typeof pad.id === "string" ? pad.id : "",
		connected: pad.connected !== false,
		source: "web-gamepad",
		standardMapping: pad.mapping === "standard",
		buttons,
		axes,
		sourceTimestamp: sampledAt,
		deliveredTimestamp: sampledAt
	};
}
/**
* Tier 1 reader: reads `navigator.getGamepads()` live on the game's own rAF and
* surfaces connect/disconnect from the game context's window events. Zero added
* latency — never crosses the host bus.
*/
var WebGamepadReader = class {
	rafId = null;
	connectedListener = null;
	disconnectedListener = null;
	started = false;
	read() {
		if (typeof navigator === "undefined" || typeof navigator.getGamepads !== "function") return [];
		let pads;
		try {
			pads = navigator.getGamepads();
		} catch {
			return [];
		}
		const sampledAt = nowMs();
		const snapshots = [];
		for (const pad of pads) {
			if (!pad || pad.connected === false) continue;
			snapshots.push(normalizeStandardGamepad(pad, sampledAt));
		}
		return snapshots;
	}
	start(onSnapshot, onConnected, onDisconnected) {
		if (this.started) this.stop();
		this.started = true;
		this.connectedListener = (event) => {
			onConnected(toConnectionEvent(event.gamepad));
		};
		this.disconnectedListener = (event) => {
			onDisconnected(toConnectionEvent(event.gamepad));
		};
		window.addEventListener("gamepadconnected", this.connectedListener);
		window.addEventListener("gamepaddisconnected", this.disconnectedListener);
		for (const snapshot of this.read()) onConnected({
			index: snapshot.index,
			id: snapshot.id,
			source: snapshot.source
		});
		const loop = () => {
			for (const snapshot of this.read()) onSnapshot(snapshot);
			this.rafId = requestAnimationFrame(loop);
		};
		this.rafId = requestAnimationFrame(loop);
	}
	stop() {
		if (this.rafId !== null) {
			cancelAnimationFrame(this.rafId);
			this.rafId = null;
		}
		if (this.connectedListener) {
			window.removeEventListener("gamepadconnected", this.connectedListener);
			this.connectedListener = null;
		}
		if (this.disconnectedListener) {
			window.removeEventListener("gamepaddisconnected", this.disconnectedListener);
			this.disconnectedListener = null;
		}
		this.started = false;
	}
};
function toConnectionEvent(pad) {
	return {
		index: pad.index,
		id: typeof pad.id === "string" ? pad.id : "",
		source: "web-gamepad"
	};
}
//#endregion
//#region src/gamepad/LatencyTracker.ts
const EMPTY_STATS = {
	p50: 0,
	p95: 0,
	max: 0,
	sampleCount: 0
};
/**
* Rolling-window latency stats (p50/p95/max) computed from
* `deliveredTimestamp - sourceTimestamp` per snapshot. A no-op when disabled so
* production builds carry zero overhead behind the input debug flag.
*/
var LatencyTracker = class {
	opts;
	samples = [];
	constructor(opts) {
		this.opts = opts;
	}
	add(sourceTimestamp, deliveredTimestamp) {
		if (!this.opts.enabled) return;
		this.samples.push(deliveredTimestamp - sourceTimestamp);
		if (this.samples.length > this.opts.windowSize) this.samples.shift();
	}
	getStats() {
		if (this.samples.length === 0) return { ...EMPTY_STATS };
		const sorted = [...this.samples].sort((a, b) => a - b);
		const pct = (p) => sorted[Math.min(sorted.length - 1, Math.ceil(p / 100 * sorted.length) - 1)];
		return {
			p50: pct(50),
			p95: pct(95),
			max: sorted[sorted.length - 1],
			sampleCount: sorted.length
		};
	}
};
//#endregion
//#region src/gamepad/MockGamepadApi.ts
/**
* Mock/playground input: a local Tier-1 passthrough. When the browser exposes the
* Web Gamepad API the dev surface reads real controllers; otherwise it reports
* unsupported with an empty pad list.
*/
var MockGamepadApi = class {
	reader = new WebGamepadReader();
	latency = new LatencyTracker({
		windowSize: 120,
		enabled: false
	});
	connectedSubscribers = /* @__PURE__ */ new Set();
	disconnectedSubscribers = /* @__PURE__ */ new Set();
	started = false;
	/** No handshake on the local/mock tier — capability is known synchronously. */
	ready() {
		return Promise.resolve();
	}
	isSupported() {
		return typeof navigator !== "undefined" && typeof navigator.getGamepads === "function";
	}
	getGamepads() {
		return this.isSupported() ? this.reader.read() : [];
	}
	onConnected(callback) {
		this.ensureStarted();
		this.connectedSubscribers.add(callback);
		return { unsubscribe: () => this.connectedSubscribers.delete(callback) };
	}
	onDisconnected(callback) {
		this.ensureStarted();
		this.disconnectedSubscribers.add(callback);
		return { unsubscribe: () => this.disconnectedSubscribers.delete(callback) };
	}
	__debug = { getLatencyStats: () => this.latency.getStats() };
	ensureStarted() {
		if (this.started || !this.isSupported()) return;
		this.started = true;
		this.reader.start(() => {}, (event) => {
			for (const callback of [...this.connectedSubscribers]) callback(event);
		}, (event) => {
			for (const callback of [...this.disconnectedSubscribers]) callback(event);
		});
	}
};
//#endregion
//#region src/iap/IapApi.ts
/**
* Billing intervals actually offered per subscription tier. Every tier ships
* weekly; LITE is weekly-only, the rest add monthly + annual. Keep in sync with
* the RevenueCat offerings — a tier must not advertise an interval it has no
* package for.
*/
const TIER_SUPPORTED_INTERVALS = {
	LITE: ["weekly"],
	CORE: [
		"weekly",
		"monthly",
		"annual"
	],
	PLUS: [
		"weekly",
		"monthly",
		"annual"
	],
	PRIME: [
		"weekly",
		"monthly",
		"annual"
	],
	ULTIMATE: [
		"weekly",
		"monthly",
		"annual"
	]
};
/**
* Rejects a purchase up front when `interval` is not offered for `tier` (e.g.
* LITE only ships weekly), throwing a {@link RundotApiError} with the
* `UNSUPPORTED_SUBSCRIPTION_INTERVAL` code. Called at the top of every
* `purchaseSubscription` implementation so the game gets a clear rejection
* instead of an opaque failed checkout.
*/
function assertTierSupportsInterval(tier, interval) {
	const supported = TIER_SUPPORTED_INTERVALS[tier];
	if (!supported?.includes(interval)) throw new RundotApiError("UNSUPPORTED_SUBSCRIPTION_INTERVAL", `The ${tier} subscription tier does not offer a ${interval} interval. Available interval(s): ${supported?.join(", ") || "none"}.`);
}
//#endregion
//#region src/iap/MockCurrencyIcon.ts
const mockCurrencyIconBase64 = "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";
//#endregion
//#region src/iap/MockIapApi.ts
const TAG$7 = "Mock IAP";
var MockIapApi = class {
	_hardCurrency = 100;
	get hardCurrency() {
		return this._hardCurrency;
	}
	set hardCurrency(value) {
		this._hardCurrency = value;
	}
	async spendCurrency(productId, cost, options) {
		mockLog(TAG$7, `spendCurrency productId=${productId} cost=${cost} balance=${this._hardCurrency}`);
		if (typeof productId !== "string" || productId.length === 0) return { success: false };
		if (!Number.isFinite(cost) || cost <= 0) return {
			success: false,
			error: "INVALID_AMOUNT"
		};
		const remainingHardCurrency = this._hardCurrency - cost;
		if (remainingHardCurrency < 0) return {
			success: false,
			error: `Not enough hard currency. Expected ${cost}, found ${this._hardCurrency}`
		};
		this._hardCurrency = remainingHardCurrency;
		return { success: true };
	}
	async getHardCurrencyBalance() {
		mockLog(TAG$7, `getHardCurrencyBalance → ${this._hardCurrency}`);
		return this._hardCurrency;
	}
	async openStore() {
		mockLog(TAG$7, "openStore (adding 100 currency)");
		this._hardCurrency += 100;
		return {
			purchased: true,
			newBalance: this._hardCurrency
		};
	}
	/**
	* One embedded blob stands in for all eight variant/tier assets — inlining
	* the real set would bloat the SDK bundle. Options are logged, not honoured,
	* so mock output never matches a `mono` request visually.
	*/
	async getCurrencyIcon(options) {
		mockLog(TAG$7, `getCurrencyIcon (variant=${options?.variant ?? "gradient"}, size=${options?.size ?? "md"})`);
		return { base64Data: mockCurrencyIconBase64 };
	}
	async getSubscriptions(tier) {
		return { "CORE": [{
			description: "core subscription",
			currencyCode: "USD",
			price: 2.99,
			interval: "weekly"
		}] };
	}
	async purchaseSubscription(tier, interval) {
		assertTierSupportsInterval(tier, interval);
		mockLog(TAG$7, `purchaseSubscription tier=${tier} interval=${interval}`);
		return { success: true };
	}
	async isUserSubscribed(tier) {
		mockLog(TAG$7, `isUserSubscribed tier=${tier} → true`);
		return true;
	}
	async hasUserMadePurchase() {
		mockLog(TAG$7, "hasUserMadePurchase → false");
		return false;
	}
	/** The legacy `gameId` argument is ignored; the mock is always empty. */
	async listDirectPurchaseSkus(_legacyGameId) {
		mockLog(TAG$7, "listDirectPurchaseSkus → []");
		return [];
	}
};
//#endregion
//#region src/credits/MockCreditsApi.ts
const TAG$6 = "Mock Credits";
var MockCreditsApi = class {
	autoPaywallOnExhaustion = true;
	autoRetryOnPurchase = true;
	balance = {
		available: 500,
		total: 600,
		freeDaily: {
			dailyCredits: 100,
			availableCredits: 100,
			nextResetAt: "2030-01-01T00:00:00.000Z"
		}
	};
	async getBillingContext() {
		mockLog(TAG$6, "getBillingContext → player / enforcement off");
		return {
			billedTo: "player",
			playerChargesEnabled: false
		};
	}
	async getBalance() {
		mockLog(TAG$6, `getBalance → ${this.balance.available}/${this.balance.total}`);
		return this.balance;
	}
	async getSubscription() {
		return {
			status: "none",
			tier: null,
			monthlyCredits: null,
			creditsRemaining: null,
			renewsAt: null,
			willRenew: false
		};
	}
	async getPlans() {
		return {
			plans: [{
				tier: "creator",
				productId: "mock_creator_monthly",
				monthlyCredits: 1e3,
				rolloverDays: 0
			}, {
				tier: "plus",
				productId: "mock_plus_monthly",
				monthlyCredits: 5e3,
				rolloverDays: 30
			}],
			plansUnavailable: false,
			topUpPacks: [{
				productId: "mock_topup_small",
				credits: 500
			}],
			freeDailyCredits: 100
		};
	}
	async estimateGenerationCost(_request) {
		throw new Error("Credit estimates require a server-backed host");
	}
	async openPaywall(options) {
		mockLog(TAG$6, `openPaywall focus=${options?.focus ?? "plans"} (mock: cancelled)`);
		return {
			outcome: "cancelled",
			balance: this.balance
		};
	}
	setAutoPaywallOnExhaustion(enabled) {
		this.autoPaywallOnExhaustion = enabled;
	}
	getAutoPaywallOnExhaustion() {
		return this.autoPaywallOnExhaustion;
	}
	setAutoRetryOnPurchase(enabled) {
		this.autoRetryOnPurchase = enabled;
	}
	getAutoRetryOnPurchase() {
		return this.autoRetryOnPurchase;
	}
	onBalanceChanged(_listener) {
		return () => {};
	}
};
//#endregion
//#region src/lifecycles/MockLifecycleApi.ts
var MockLifecycleApi = class {
	pauseCallbacks = /* @__PURE__ */ new Set();
	resumeCallbacks = /* @__PURE__ */ new Set();
	awakeCallbacks = /* @__PURE__ */ new Set();
	sleepCallbacks = /* @__PURE__ */ new Set();
	quitCallbacks = /* @__PURE__ */ new Set();
	backButtonCallbacks = /* @__PURE__ */ new Set();
	identityChangedCallbacks = /* @__PURE__ */ new Set();
	notificationCallbacks = /* @__PURE__ */ new Set();
	safeAreaChangedCallbacks = /* @__PURE__ */ new Set();
	deviceChangedCallbacks = /* @__PURE__ */ new Set();
	onSleep(callback) {
		this.sleepCallbacks.add(callback);
		return { unsubscribe: () => {
			this.sleepCallbacks.delete(callback);
		} };
	}
	onAwake(callback) {
		this.awakeCallbacks.add(callback);
		return { unsubscribe: () => {
			this.awakeCallbacks.delete(callback);
		} };
	}
	onPause(callback) {
		this.pauseCallbacks.add(callback);
		return { unsubscribe: () => {
			this.pauseCallbacks.delete(callback);
		} };
	}
	onResume(callback) {
		this.resumeCallbacks.add(callback);
		return { unsubscribe: () => {
			this.resumeCallbacks.delete(callback);
		} };
	}
	onQuit(callback) {
		this.quitCallbacks.add(callback);
		return { unsubscribe: () => {
			this.quitCallbacks.delete(callback);
		} };
	}
	triggerPauseCallbacks() {
		for (const callback of this.pauseCallbacks) callback();
	}
	triggerResumeCallbacks() {
		for (const callback of this.resumeCallbacks) callback();
	}
	triggerAwakeCallbacks() {
		for (const callback of this.awakeCallbacks) callback();
	}
	triggerSleepCallbacks() {
		for (const callback of this.sleepCallbacks) callback();
	}
	triggerQuitCallbacks() {
		for (const callback of this.quitCallbacks) callback();
	}
	onBackButton(callback) {
		this.backButtonCallbacks.add(callback);
		return { unsubscribe: () => {
			this.backButtonCallbacks.delete(callback);
		} };
	}
	triggerBackButtonCallbacks() {
		for (const callback of this.backButtonCallbacks) callback();
	}
	onIdentityChanged(callback) {
		this.identityChangedCallbacks.add(callback);
		return { unsubscribe: () => {
			this.identityChangedCallbacks.delete(callback);
		} };
	}
	triggerIdentityChangedCallbacks(event) {
		for (const callback of this.identityChangedCallbacks) callback(event);
	}
	onSafeAreaChanged(callback) {
		this.safeAreaChangedCallbacks.add(callback);
		return { unsubscribe: () => {
			this.safeAreaChangedCallbacks.delete(callback);
		} };
	}
	triggerSafeAreaChanged(safeArea) {
		for (const callback of this.safeAreaChangedCallbacks) callback(safeArea);
	}
	onDeviceChanged(callback) {
		this.deviceChangedCallbacks.add(callback);
		return { unsubscribe: () => {
			this.deviceChangedCallbacks.delete(callback);
		} };
	}
	triggerDeviceChanged(device) {
		for (const callback of this.deviceChangedCallbacks) callback(device);
	}
	pendingNotification = null;
	onNotification(callback) {
		this.notificationCallbacks.add(callback);
		const pending = this.pendingNotification;
		if (pending) {
			this.pendingNotification = null;
			queueMicrotask(() => callback(pending));
		}
		return { unsubscribe: () => {
			this.notificationCallbacks.delete(callback);
		} };
	}
	/** Playground/mock parity: simulate a warm notification tap. */
	triggerNotificationCallbacks(event) {
		if (this.notificationCallbacks.size === 0) {
			this.pendingNotification = event;
			return;
		}
		for (const callback of this.notificationCallbacks) callback(event);
	}
};
//#endregion
//#region src/logging/MockLoggingApi.ts
var MockLoggingApi = class {
	logDebug(message, ...args) {
		console.log(message, ...args);
	}
	logError(message, ...args) {
		console.error(message, ...args);
	}
};
//#endregion
//#region src/navigation/MockNavigationApi.ts
const TAG$5 = "Mock Navigation";
var MockNavigationApi = class {
	rundotGameApi;
	constructor(rundotGameApi) {
		this.rundotGameApi = rundotGameApi;
	}
	async requestPopOrQuit(options) {
		return true;
	}
	getStackInfo() {
		const rundotGameApi = this.rundotGameApi;
		return {
			isInStack: rundotGameApi._mock.stackState.isInStack,
			stackPosition: rundotGameApi._mock.stackState.stackPosition,
			isTopOfStack: rundotGameApi._mock.stackState.isTopOfStack,
			stackDepth: rundotGameApi._mock.stackState.stackDepth,
			parentInstanceId: rundotGameApi._mock.stackState.parentInstanceId
		};
	}
	async popApp() {
		const rundotGameApi = this.rundotGameApi;
		if (rundotGameApi._mock.stackState.stackDepth <= 1) {
			console.warn("[RUN:mock] Cannot pop - at base of stack or not in stack");
			return;
		}
		await createMockDelay(MOCK_DELAYS.short);
		const poppedApp = rundotGameApi._mock.stackState.stackHistory.pop();
		mockLog(TAG$5, "popApp", poppedApp);
		rundotGameApi._mock.stackState.stackDepth--;
		rundotGameApi._mock.stackState.stackPosition = Math.max(0, rundotGameApi._mock.stackState.stackDepth - 1);
		if (rundotGameApi._mock.stackState.stackDepth === 0) {
			rundotGameApi._mock.stackState.isInStack = false;
			rundotGameApi._mock.stackState.isTopOfStack = false;
			rundotGameApi._mock.stackState.parentInstanceId = null;
		}
	}
	async pushApp(appId, options) {
		const rundotGameApi = this.rundotGameApi;
		await createMockDelay(MOCK_DELAYS.medium);
		rundotGameApi._mock.stackState.stackHistory.push({
			appId,
			pushedAt: Date.now(),
			contextData: options?.contextData,
			appParams: options?.appParams
		});
		rundotGameApi._mock.stackState.isInStack = true;
		rundotGameApi._mock.stackState.stackDepth++;
		rundotGameApi._mock.stackState.stackPosition = rundotGameApi._mock.stackState.stackDepth - 1;
		rundotGameApi._mock.stackState.isTopOfStack = true;
		mockLog(TAG$5, `pushApp appId=${appId}`);
	}
	async navigateToGame(targetGameId, options) {
		await createMockDelay(MOCK_DELAYS.medium);
		mockLog(TAG$5, `navigateToGame targetGameId=${targetGameId}`, {
			hasLaunchContext: !!options?.launchContext,
			hasReturnContext: !!options?.returnContext
		});
	}
};
//#endregion
//#region src/notifications/MockNotificationsApi.ts
const TAG$4 = "Mock Notifications";
var MockNotificationsApi = class {
	rundotGameApi;
	constructor(rundotGameApi) {
		this.rundotGameApi = rundotGameApi;
	}
	async cancelNotification(notificationId) {
		mockLog(TAG$4, `cancelNotification id=${notificationId}`);
		const rundotGameApi = this.rundotGameApi;
		if (isWebPlatform()) return true;
		await createMockDelay(MOCK_DELAYS.short);
		if (rundotGameApi._mock.scheduledNotifications && rundotGameApi._mock.scheduledNotifications[notificationId]) {
			delete rundotGameApi._mock.scheduledNotifications[notificationId];
			return true;
		}
		return false;
	}
	async getAllScheduledLocalNotifications() {
		if (isWebPlatform()) return [];
		await createMockDelay(MOCK_DELAYS.short);
		const notifications = this.rundotGameApi._mock.scheduledNotifications || {};
		return Object.values(notifications);
	}
	async isLocalNotificationsEnabled() {
		if (isWebPlatform()) return false;
		await createMockDelay(MOCK_DELAYS.short);
		return this.rundotGameApi._mock.notificationsEnabled !== false;
	}
	async submitMessageAsync(input) {
		mockLog(TAG$4, `submitMessageAsync channels=${input.channels.join(",")}`);
		await createMockDelay(MOCK_DELAYS.short);
		const messageId = `mock-message-${Date.now()}`;
		const results = [];
		if (input.channels.includes("local")) {
			if (isWebPlatform()) results.push({
				channel: "local",
				status: "skipped",
				reason: "unsupported_platform"
			});
			else {
				const id = input.notificationId || `mock-notification-${Date.now()}`;
				results.push({
					channel: "local",
					status: "scheduled",
					id
				});
			}
		}
		const wantsServer = input.channels.includes("rcs");
		if (wantsServer && !isWebPlatform()) {
			results.push({
				channel: "inbox",
				status: "scheduled",
				id: messageId
			});
			results.push({
				channel: "rcs",
				status: "scheduled",
				id: `mock-rcs-${Date.now()}`
			});
		} else if (wantsServer && isWebPlatform()) results.push({
			channel: "rcs",
			status: "skipped",
			reason: "unsupported_platform"
		});
		return {
			messageId,
			results
		};
	}
	async scheduleAsync(title, body, seconds, notificationId, options) {
		mockLog(TAG$4, `scheduleAsync title="${title}" seconds=${seconds}`);
		const { priority = 50, groupId, payload } = options || {};
		if (isWebPlatform()) return `mock-web-notification-${Date.now()}`;
		const rundotGameApi = this.rundotGameApi;
		if (!rundotGameApi._mock.pendingRequests) rundotGameApi._mock.pendingRequests = {};
		const requestId = Date.now().toString();
		return new Promise((resolve) => {
			rundotGameApi._mock.pendingRequests[requestId] = { resolve };
			const id = notificationId || `mock-notification-${Date.now()}`;
			if (!rundotGameApi._mock.scheduledNotifications) rundotGameApi._mock.scheduledNotifications = {};
			rundotGameApi._mock.scheduledNotifications[id] = {
				id,
				title,
				body,
				payload,
				seconds
			};
			setTimeout(() => {
				resolve(id);
			}, MOCK_DELAYS.short);
		});
	}
	async setLocalNotificationsEnabled(enabled) {
		const rundotGameApi = this.rundotGameApi;
		if (isWebPlatform()) return true;
		await createMockDelay(MOCK_DELAYS.short);
		rundotGameApi._mock.notificationsEnabled = enabled;
		return enabled;
	}
	async getRCSAvailableAsync() {
		mockLog(TAG$4, `getRCSAvailableAsync()`);
		await createMockDelay(MOCK_DELAYS.short);
		return { available: true };
	}
	async scheduleRCSAsync(input) {
		mockLog(TAG$4, `scheduleRCSAsync title="${input.title}" triggerAt=${input.triggerAt ?? ""} delaySeconds=${input.delaySeconds ?? ""}`);
		await createMockDelay(MOCK_DELAYS.short);
		return {
			scheduleId: `mock-rcs-${Date.now()}`,
			status: "pending"
		};
	}
	async requestRCSOptInAsync(input) {
		mockLog(TAG$4, `requestRCSOptInAsync rewardCopy="${input?.rewardCopy ?? ""}"`);
		await createMockDelay(MOCK_DELAYS.short);
		return {
			status: "subscribed",
			newlySubscribed: true
		};
	}
};
//#endregion
//#region src/popups/MockPopupsApi.ts
var MockPopupsApi = class {
	overlay;
	constructor(override) {
		this.overlay = override;
	}
	async showToast(message, options) {
		options?.variant;
		options?.duration;
		const action = options?.action;
		if (action) {
			if (window.confirm(`${message}\n\n[${action.label}] or [Cancel]`)) return true;
		}
		return false;
	}
	async showLikeDialog() {
		return {
			shown: true,
			dismissed: false,
			liked: true
		};
	}
	async canShowLikeDialog() {
		return { available: true };
	}
	async showCommentsPanel() {
		return {
			shown: true,
			dismissed: true
		};
	}
	async canShowCommentsPanel() {
		return { available: true };
	}
	async getLikeState() {
		return {
			isLiked: false,
			likesCount: 0
		};
	}
};
//#endregion
//#region src/profile/PlaygroundProfileApi.ts
/**
* Playground profile API.
*
* In playground mode (browser + real backend), profile identity must match the backend's
* notion of profileId (which is effectively the Firebase Auth UID in this codebase).
*
* This implementation reads from `rundotGameApi._profileData`, which is populated by
* PlaygroundHost when Firebase auth state changes.
*
* NOTE: `ProfileApi` is synchronous, so we return a placeholder profile until the
* user signs in and `_profileData` is available.
*/
var PlaygroundProfileApi = class {
	rundotGameApi;
	constructor(rundotGameApi) {
		this.rundotGameApi = rundotGameApi;
	}
	getCurrentProfile() {
		const profile = this.rundotGameApi._profileData;
		if (profile?.id && profile?.username) return {
			id: profile.id,
			username: profile.username,
			name: profile.name,
			avatarUrl: profile.avatarUrl,
			isAnonymous: profile.isAnonymous
		};
		return {
			id: "unknown-user",
			username: "unknown-user",
			isAnonymous: true
		};
	}
};
//#endregion
//#region src/utils/idGenerator.ts
/**
* Generate a unique ID using timestamp and random component
*/
function generateId() {
	return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}
//#endregion
//#region src/rooms/RundotGameRoom.ts
const ROOM_GAME_PHASES = [
	"waiting",
	"playing",
	"ended"
];
var RundotGameRoom = class {
	id;
	name;
	players;
	maxPlayers;
	gameType;
	appId;
	type;
	createdBy;
	createdAt;
	updatedAt;
	isPrivate;
	status;
	customMetadata;
	admins;
	roomCode;
	description;
	data;
	version;
	constructor(roomData) {
		this.id = roomData.id;
		this.name = roomData.name;
		this.players = Array.isArray(roomData.players) ? [...roomData.players] : [];
		this.maxPlayers = roomData.maxPlayers;
		this.gameType = roomData.gameType;
		this.appId = roomData.appId;
		this.type = roomData.type;
		this.createdBy = roomData.createdBy;
		this.createdAt = roomData.createdAt;
		this.updatedAt = roomData.updatedAt;
		this.isPrivate = roomData.isPrivate;
		this.status = roomData.status;
		this.customMetadata = roomData.customMetadata || {};
		this.admins = Array.isArray(roomData.admins) ? [...roomData.admins] : [];
		this.roomCode = roomData.roomCode;
		this.description = roomData.description;
		this.data = roomData.data || {};
		this.version = roomData.version;
	}
};
//#endregion
//#region src/rooms/index.ts
const ROOMS_DEPRECATION_REPLACEMENTS = {
	createRoomAsync: "RundotGameAPI.realtime.createRoom(roomType)",
	joinOrCreateRoomAsync: "RundotGameAPI.realtime.joinOrCreateRoom(roomType)",
	joinRoomByCodeAsync: "RundotGameAPI.realtime.joinRoomByCode(code)",
	getUserRoomsAsync: "RundotGameAPI.realtime.getUserRooms(options?)",
	subscribeAsync: "room.on() on a RundotGameAPI.realtime room",
	sendRoomMessageAsync: "room.send() on a RundotGameAPI.realtime room",
	leaveRoomAsync: "room.leave() on a RundotGameAPI.realtime room",
	updateRoomDataAsync: "server-authoritative state in your realtime GameRoom class",
	getRoomDataAsync: "server-authoritative state in your realtime GameRoom class",
	kickPlayerAsync: "this.kick() in your realtime GameRoom class",
	startRoomGameAsync: "lifecycle logic in your realtime GameRoom class",
	proposeMoveAsync: "onGameMessage() handling in your realtime GameRoom class",
	validateMoveAsync: "onGameMessage() handling in your realtime GameRoom class"
};
function bindMethod(target, targetKey, source, warn, sourceKey) {
	const fn = source?.[sourceKey ?? targetKey];
	if (typeof fn === "function") {
		target[targetKey] = (...args) => {
			warn(targetKey);
			return fn.apply(source, args);
		};
		return true;
	}
	return false;
}
function initializeRoomsApi(rundotGameApi, host) {
	const roomsApi = host?.rooms;
	if (!roomsApi) {
		console.warn("[RUN] Host did not provide a rooms implementation. Rooms API will be unavailable.");
		return;
	}
	const warned = /* @__PURE__ */ new Set();
	const warnDeprecated = (method) => {
		if (warned.has(method)) return;
		warned.add(method);
		const replacement = ROOMS_DEPRECATION_REPLACEMENTS[method] ?? "RundotGameAPI.realtime";
		console.warn(`[RUN] DEPRECATED: RundotGameAPI.rooms.${method}() is deprecated and unsupported. Realtime (RundotGameAPI.realtime) is the only supported multiplayer API — use ${replacement}. See the Multiplayer docs for the migration guide.`);
	};
	const rundotGame = rundotGameApi;
	const existingNamespace = rundotGame.rooms || {};
	const roomsNamespace = Object.assign({}, existingNamespace);
	[
		["createRoomAsync"],
		["joinOrCreateRoomAsync"],
		["joinRoomByCodeAsync"],
		["getUserRoomsAsync"],
		["subscribeAsync"],
		["updateRoomDataAsync"],
		["getRoomDataAsync"],
		["sendRoomMessageAsync"],
		["leaveRoomAsync"],
		["kickPlayerAsync"],
		["startRoomGameAsync"],
		["proposeMoveAsync"],
		["validateMoveAsync"]
	].forEach(([targetKey, sourceKey]) => {
		bindMethod(roomsNamespace, targetKey, roomsApi, warnDeprecated, sourceKey);
	});
	rundotGame.rooms = roomsNamespace;
}
//#endregion
//#region src/storage/validateStorage.ts
const MAX_KEY_BYTES = 256;
const MAX_VALUE_BYTES = 1e6;
const MAX_BATCH_ITEMS = 400;
const MAX_MULTI_GET_KEYS = 100;
const METADATA_PREFIX = "__";
const LEGACY_METADATA_FIELDS = /* @__PURE__ */ new Set(["lastUpdated"]);
function validateStorageKey(key) {
	if (typeof key !== "string" || key.length === 0) throw new RundotApiError("INVALID_ARGUMENT", "Key must be a non-empty string", 400);
	if (utf8ByteLength(key) > MAX_KEY_BYTES) throw new RundotApiError("INVALID_ARGUMENT", `Key exceeds maximum size of ${MAX_KEY_BYTES} bytes`, 400);
	if (key.includes(".")) throw new RundotApiError("INVALID_ARGUMENT", "Key must not contain \".\"", 400);
	if (key.startsWith(METADATA_PREFIX)) throw new RundotApiError("INVALID_ARGUMENT", `Key must not start with "${METADATA_PREFIX}"`, 400);
	if (LEGACY_METADATA_FIELDS.has(key)) throw new RundotApiError("INVALID_ARGUMENT", `Key "${key}" is reserved`, 400);
}
function validateStorageValue(value) {
	if (typeof value !== "string") throw new RundotApiError("INVALID_ARGUMENT", "Value must be a string", 400);
	const byteLength = utf8ByteLength(value);
	if (byteLength > MAX_VALUE_BYTES) throw new RundotApiError("PAYLOAD_TOO_LARGE", `Value of ${byteLength} bytes exceeds maximum size of ${MAX_VALUE_BYTES} bytes`, 413);
}
function validateStorageBatchSize(itemCount) {
	if (itemCount > MAX_BATCH_ITEMS) throw new RundotApiError("INVALID_ARGUMENT", `Batch exceeds maximum item count of ${MAX_BATCH_ITEMS}`, 400);
}
function validateStorageMultiGetSize(keyCount) {
	if (keyCount > MAX_MULTI_GET_KEYS) throw new RundotApiError("INVALID_ARGUMENT", `Multi-get exceeds maximum key count of ${MAX_MULTI_GET_KEYS}`, 400);
}
//#endregion
//#region src/storage/ValidatingStorageApi.ts
/**
* Wraps a StorageApi (MockStorageApi / FirestoreStorageApi) so the
* non-production storage backends reject exactly what the server rejects,
* matching the RundotApiError a real device surfaces. Applied only to
* server-backed scopes (appStorage / ownerStorage / sharedStorage). deviceCache
* is device-local and unvalidated in prod, so it is never wrapped.
*/
var ValidatingStorageApi = class {
	delegate;
	constructor(delegate) {
		this.delegate = delegate;
	}
	key(index) {
		return this.delegate.key(index);
	}
	clear() {
		return this.delegate.clear();
	}
	length() {
		return this.delegate.length();
	}
	getAllItems() {
		return this.delegate.getAllItems();
	}
	getAllData() {
		return this.delegate.getAllData();
	}
	getItem(key) {
		return this.delegate.getItem(key);
	}
	async setItem(key, item) {
		validateStorageKey(key);
		validateStorageValue(item);
		return this.delegate.setItem(key, item);
	}
	async removeItem(key) {
		validateStorageKey(key);
		return this.delegate.removeItem(key);
	}
	async setMultipleItems(items) {
		validateStorageBatchSize(items.length);
		for (const { key, value } of items) {
			validateStorageKey(key);
			validateStorageValue(value);
		}
		return this.delegate.setMultipleItems(items);
	}
	async removeMultipleItems(keys) {
		validateStorageBatchSize(keys.length);
		for (const key of keys) validateStorageKey(key);
		return this.delegate.removeMultipleItems(keys);
	}
	async compareAndSwap(key, expectedValue, nextValue) {
		validateStorageKey(key);
		if (expectedValue !== null) validateStorageValue(expectedValue);
		if (nextValue !== null) validateStorageValue(nextValue);
		return this.delegate.compareAndSwap(key, expectedValue, nextValue);
	}
	async getMultipleItems(keys) {
		validateStorageMultiGetSize(keys.length);
		for (const key of keys) validateStorageKey(key);
		return this.delegate.getMultipleItems(keys);
	}
};
//#endregion
//#region src/storage/MockStorageApi.ts
const STORAGE_PREFIXES = {
	deviceCache: "rundotGame:deviceCache",
	appStorage: "rundotGame:appStorage",
	ownerStorage: "rundotGame:ownerStorage"
};
/** Page-lifetime store for documents with an opaque origin, where Web Storage throws. */
function createMemoryKeyValueStore() {
	const entries = /* @__PURE__ */ new Map();
	return {
		get length() {
			return entries.size;
		},
		key: (index) => [...entries.keys()][index] ?? null,
		getItem: (key) => entries.get(key) ?? null,
		setItem: (key, value) => {
			entries.set(key, String(value));
		},
		removeItem: (key) => {
			entries.delete(key);
		}
	};
}
function createMockStorageApi(storageType, appUrl, store) {
	const appIdentifier = appUrl ? generateAppIdentifier(appUrl) : null;
	let prefix = STORAGE_PREFIXES[storageType];
	let syncDelay = 0;
	switch (storageType) {
		case "deviceCache":
			syncDelay = 0;
			break;
		case "appStorage":
		case "ownerStorage":
			syncDelay = 100;
			break;
		default: throw new Error(`Unknown storage type: ${storageType}`);
	}
	prefix = !appIdentifier ? `${prefix}:` : `${prefix}:${appIdentifier}:`;
	const api = new MockStorageApi(prefix, syncDelay, store);
	return storageType === "deviceCache" ? api : new ValidatingStorageApi(api);
}
var MockStorageApi = class {
	prefix;
	syncDelay;
	orderStorageKey;
	backingStore;
	constructor(prefix, syncDelay, store) {
		this.prefix = prefix;
		this.syncDelay = syncDelay;
		this.orderStorageKey = `${prefix}__order__`;
		this.backingStore = store;
	}
	get store() {
		return this.backingStore ?? localStorage;
	}
	async clear() {
		const keysToRemove = [];
		const fullLength = this.store.length;
		for (let i = 0; i < fullLength; i++) {
			const fullKey = this.store.key(i);
			if (!fullKey || fullKey === this.orderStorageKey) continue;
			if (fullKey.startsWith(this.prefix)) keysToRemove.push(fullKey);
		}
		for (const key of keysToRemove) this.store.removeItem(key);
		this.clearOrder();
		await this.simulateSyncDelay();
	}
	async getAllItems() {
		const items = new Array();
		const orderedKeys = this.keys();
		for (const key of orderedKeys) if (this.store.getItem(this.buildKey(key)) !== null) items.push(key);
		else this.removeFromOrder(key);
		return items;
	}
	async getAllData() {
		const result = {};
		const orderedKeys = this.keys();
		for (const key of orderedKeys) {
			const value = this.store.getItem(this.buildKey(key));
			if (value !== null) result[key] = value;
			else this.removeFromOrder(key);
		}
		return result;
	}
	async getItem(key) {
		const fullKey = this.buildKey(key);
		await this.simulateSyncDelay();
		return this.store.getItem(fullKey);
	}
	async key(index) {
		const keys = this.keys();
		if (index < 0 || index >= keys.length) return null;
		await this.simulateSyncDelay();
		return keys[index];
	}
	async length() {
		return this.keys().length;
	}
	async removeItem(key) {
		const fullKey = this.buildKey(key);
		await this.simulateSyncDelay();
		this.store.removeItem(fullKey);
		this.removeFromOrder(key);
	}
	async setItem(key, item) {
		const fullKey = this.buildKey(key);
		await this.simulateSyncDelay();
		this.store.setItem(fullKey, item);
		this.upsertOrder(key);
	}
	async setMultipleItems(entries) {
		for (const entry of entries) {
			const fullKey = this.buildKey(entry.key);
			this.store.setItem(fullKey, entry.value);
		}
		await this.simulateSyncDelay();
		this.bulkUpsertOrder(entries.map((entry) => entry.key));
	}
	async removeMultipleItems(keys) {
		for (const key of keys) {
			const fullKey = this.buildKey(key);
			this.store.removeItem(fullKey);
		}
		await this.simulateSyncDelay();
		this.bulkRemoveFromOrder(keys);
	}
	async compareAndSwap(key, expectedValue, nextValue) {
		const fullKey = this.buildKey(key);
		await this.simulateSyncDelay();
		const currentValue = this.store.getItem(fullKey);
		if (currentValue !== expectedValue) return {
			swapped: false,
			currentValue
		};
		if (nextValue === null) {
			this.store.removeItem(fullKey);
			this.removeFromOrder(key);
		} else {
			this.store.setItem(fullKey, nextValue);
			this.upsertOrder(key);
		}
		return { swapped: true };
	}
	async getMultipleItems(keys) {
		const result = {};
		for (const key of this.dedupeKeys(keys)) {
			const value = this.store.getItem(this.buildKey(key));
			if (value !== null) result[key] = value;
		}
		return result;
	}
	buildKey(key) {
		return `${this.prefix}${key}`;
	}
	extractKey(fullKey) {
		const prefix = this.prefix;
		return fullKey.substring(prefix.length);
	}
	keys() {
		return [...this.readOrder()];
	}
	async simulateSyncDelay() {
		const syncDelay = this.syncDelay;
		if (syncDelay > 0) await new Promise((resolve) => setTimeout(resolve, syncDelay));
	}
	readOrder() {
		const raw = this.store.getItem(this.orderStorageKey);
		if (!raw) return this.rebuildOrderFromStorage();
		try {
			const parsed = JSON.parse(raw);
			if (Array.isArray(parsed)) return this.normalizeOrder(parsed);
		} catch {}
		return this.rebuildOrderFromStorage();
	}
	normalizeOrder(order) {
		const seen = /* @__PURE__ */ new Set();
		const normalized = [];
		let changed = false;
		for (const entry of order) {
			if (typeof entry !== "string") {
				changed = true;
				continue;
			}
			if (seen.has(entry)) {
				changed = true;
				continue;
			}
			const fullKey = this.buildKey(entry);
			if (this.store.getItem(fullKey) === null) {
				changed = true;
				continue;
			}
			seen.add(entry);
			normalized.push(entry);
		}
		if (changed) this.writeOrder(normalized);
		return normalized;
	}
	rebuildOrderFromStorage() {
		const keys = [];
		const total = this.store.length;
		for (let i = 0; i < total; i++) {
			const fullKey = this.store.key(i);
			if (!fullKey) continue;
			if (fullKey === this.orderStorageKey) continue;
			if (fullKey.startsWith(this.prefix)) keys.push(this.extractKey(fullKey));
		}
		this.writeOrder(keys);
		return keys;
	}
	upsertOrder(key) {
		const order = this.readOrder();
		const index = order.indexOf(key);
		if (index !== -1) order.splice(index, 1);
		order.push(key);
		this.writeOrder(order);
	}
	bulkUpsertOrder(keys) {
		const dedupedKeys = this.dedupeKeys(keys);
		if (dedupedKeys.length === 0) return;
		const order = this.readOrder();
		const keysSet = new Set(dedupedKeys);
		const filtered = order.filter((entry) => !keysSet.has(entry));
		for (const key of dedupedKeys) filtered.push(key);
		this.writeOrder(filtered);
	}
	removeFromOrder(key) {
		const order = this.readOrder();
		const index = order.indexOf(key);
		if (index !== -1) {
			order.splice(index, 1);
			this.writeOrder(order);
		}
	}
	bulkRemoveFromOrder(keys) {
		const dedupedKeys = this.dedupeKeys(keys);
		if (dedupedKeys.length === 0) return;
		const order = this.readOrder();
		const keysSet = new Set(dedupedKeys);
		const filtered = order.filter((entry) => !keysSet.has(entry));
		if (filtered.length !== order.length) this.writeOrder(filtered);
	}
	writeOrder(order) {
		if (order.length === 0) {
			this.store.removeItem(this.orderStorageKey);
			return;
		}
		this.store.setItem(this.orderStorageKey, JSON.stringify(order));
	}
	clearOrder() {
		this.store.removeItem(this.orderStorageKey);
	}
	dedupeKeys(keys) {
		const result = [];
		const seen = /* @__PURE__ */ new Set();
		for (const key of keys) {
			if (typeof key !== "string") continue;
			if (seen.has(key)) continue;
			seen.add(key);
			result.push(key);
		}
		return result;
	}
};
function generateAppIdentifier(appUrl) {
	if (!appUrl) appUrl = "";
	const normalizedId = normalizeAppIdentifier(appUrl);
	let hash = 0;
	for (let i = 0; i < normalizedId.length; i++) {
		const char = normalizedId.charCodeAt(i);
		hash = (hash << 5) - hash + char;
		hash |= 0;
	}
	return Math.abs(hash).toString(16);
}
function normalizeAppIdentifier(input) {
	if (input.startsWith("http")) try {
		const url = new URL(input);
		const pathParts = url.pathname.split("/");
		const h5Index = pathParts.findIndex((part) => part === "H5");
		if (h5Index !== -1 && h5Index < pathParts.length - 1) return pathParts[h5Index + 1];
		return url.hostname;
	} catch (error) {
		console.error(`[RUN:mock] Error parsing URL: ${error}`, { input });
		return input;
	}
	if (input.includes("/H5/")) try {
		const pathParts = input.split("/");
		const h5Index = pathParts.findIndex((part) => part === "H5");
		if (h5Index !== -1 && h5Index < pathParts.length - 1) return pathParts[h5Index + 1];
	} catch (error) {
		console.error(`[RUN:mock] Error parsing path-based URL: ${error}`, { input });
	}
	return input;
}
//#endregion
//#region src/time/utils.ts
function isPacificDaylightTime(date) {
	const year = date.getFullYear();
	const daysUntilSundayInMarch = (7 - new Date(year, 2, 8).getDay()) % 7;
	const dstStart = new Date(year, 2, 8 + daysUntilSundayInMarch);
	dstStart.setHours(2, 0, 0, 0);
	const daysUntilSundayInNov = (7 - new Date(year, 10, 1).getDay()) % 7;
	const dstEnd = new Date(year, 10, 1 + daysUntilSundayInNov);
	dstEnd.setHours(2, 0, 0, 0);
	return date >= dstStart && date < dstEnd;
}
//#endregion
//#region src/time/MockTimeApi.ts
var MockTimeApi = class {
	rundotGameApi;
	constructor(rundotGameApi) {
		this.rundotGameApi = rundotGameApi;
	}
	formatNumber(value, options) {
		const locale = this.rundotGameApi.getLocale();
		const numberOptions = {
			style: options?.style || "decimal",
			minimumFractionDigits: options?.minimumFractionDigits || 0,
			maximumFractionDigits: options?.maximumFractionDigits || 2,
			...options
		};
		return value.toLocaleString(locale, numberOptions);
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
		if (options?.timezone) switch (options?.timezone.toUpperCase()) {
			case "PT":
			case "PST":
			case "PDT": {
				const ptOffset = isPacificDaylightTime(result) ? -7 : -8;
				result.getUTCDate();
				result.getUTCMonth();
				result.getUTCFullYear();
				result.setUTCHours(0, 0, 0, 0);
				const { hour = 0, minute = 0, second = 0 } = options.timeOfDay || {};
				const utcHour = (hour - ptOffset) % 24;
				result.setUTCHours(utcHour, minute, second, 0);
				break;
			}
			default: console.warn(`[RUN:mock] Timezone ${options.timezone} not supported, using local time`);
		}
		return result.getTime();
	}
	async requestTimeAsync() {
		await createMockDelay(MOCK_DELAYS.short);
		const rundotGameApi = this.rundotGameApi;
		const mockOffset = rundotGameApi._mock.serverTimeOffset || 2500;
		const mockServerTime = Date.now() + mockOffset;
		const timezoneOffset = (/* @__PURE__ */ new Date()).getTimezoneOffset();
		const localTime = mockServerTime - timezoneOffset * 6e4;
		return {
			serverTime: mockServerTime,
			localTime,
			timezoneOffset,
			formattedTime: new Date(localTime).toISOString(),
			locale: rundotGameApi._mock.user?.locale || "en-US"
		};
	}
};
//#endregion
//#region src/stats/MockStatsApi.ts
const TAG$3 = "Mock Stats";
/**
* In-memory implementation of StatsApi for playground + Storybook environments.
* No rule eval — `submit()` always resolves with an empty `grants` array.
* Useful for testing UI flows that read stat values without needing a real
* backend.
*/
var MockStatsApi = class {
	values = /* @__PURE__ */ new Map();
	async submit(statId, value) {
		if (typeof statId !== "string" || statId.trim().length === 0) throw new Error("statId is required");
		if (typeof value !== "number" || !Number.isFinite(value)) throw new Error("value must be a valid number");
		if (value > Number.MAX_SAFE_INTEGER || value < Number.MIN_SAFE_INTEGER) throw new Error("Stat value is invalid");
		mockLog(TAG$3, `submit ${statId}=${value}`);
		this.values.set(statId, value);
		return { grants: [] };
	}
	async getValue(statId) {
		return this.values.has(statId) ? this.values.get(statId) ?? null : null;
	}
	async getAllValues() {
		return Object.fromEntries(this.values);
	}
};
//#endregion
//#region src/collectibles/MockCollectiblesApi.ts
const TAG$2 = "Mock Collectibles";
/** In-memory collectibles API for playground + Storybook. Always returns the
*  same small fixture catalog; claims always succeed. */
var MockCollectiblesApi = class {
	cards = [{
		cardId: "curse_of_marble_ep1_intro",
		storyId: "curse_of_marble",
		episodeId: "ep1",
		type: "free",
		rarity: "common",
		title: "The Beginning",
		description: "Marble's first day at the academy.",
		artPath: "Cards/curse_of_marble/ep1_intro.png",
		thumbPath: "Cards/curse_of_marble/ep1_intro_thumb.png"
	}, {
		cardId: "curse_of_marble_vip",
		storyId: "curse_of_marble",
		type: "vip",
		rarity: "legendary",
		title: "Marble Ascended",
		description: "Only for dedicated viewers.",
		artPath: "Cards/curse_of_marble/vip.png",
		thumbPath: "Cards/curse_of_marble/vip_thumb.png"
	}];
	async listCards() {
		mockLog(TAG$2, `listCards (${this.cards.length} cards)`);
		return [...this.cards];
	}
	async claimVipCard(seriesId, cardId) {
		mockLog(TAG$2, `claimVipCard series=${seriesId} card=${cardId}`);
		return {
			granted: true,
			cardId
		};
	}
};
//#endregion
//#region src/game-preloader/MockPreloaderApi.ts
var MockPreloaderApi = class {
	async showLoadScreen() {}
	async hideLoadScreen() {}
	async setLoaderText(text) {}
	async setLoaderProgress(progress) {}
};
//#endregion
//#region src/ugc/checkText.ts
/**
* All 23 languages, obfuscation + fuzzy matching on. Matches the server's
* policy for UGC, comments, profiles, and game tags.
*/
const STRICT_PROFANITY_POLICY = Object.freeze({
	allLanguages: true,
	allowObfuscatedMatch: true,
	wordBoundaries: true,
	fuzzyToleranceLevel: .6
});
/**
* Exact-match English only. Matches the server's policy for AI generation
* prompts. The fuzzy level is above glin's 1.0 score ceiling, which makes
* fuzzy matching impossible and leaves only exact regex matches.
*/
const LENIENT_PROFANITY_POLICY = Object.freeze({
	languages: ["english"],
	allowObfuscatedMatch: false,
	wordBoundaries: true,
	fuzzyToleranceLevel: 1.1,
	ignoreWords: [
		"sexy",
		"suck",
		"butt",
		"bastard"
	]
});
let glinModulePromise = null;
function loadGlin() {
	if (!glinModulePromise) glinModulePromise = import("./dist-DxOnYUkS.js");
	return glinModulePromise;
}
const GLIN_OBFUSCATION_WARN = "[Glin-Profanity] Obfuscated match enabled → wordBoundaries will be ignored internally.";
function withGlinWarnSuppressed(fn) {
	const originalWarn = console.warn;
	console.warn = (...args) => {
		if (args[0] === GLIN_OBFUSCATION_WARN) return;
		originalWarn.apply(console, args);
	};
	try {
		return fn();
	} finally {
		console.warn = originalWarn;
	}
}
/**
* Shared implementation behind UgcApi.checkTextAsync. Fail-open: any internal
* glin error (load or check) resolves to a clean result, matching the
* server's behavior for its local profanity check. Never rejects.
*/
async function checkText(text, options) {
	try {
		const { checkProfanity } = await loadGlin();
		const policy = options?.policy === "lenient" ? LENIENT_PROFANITY_POLICY : STRICT_PROFANITY_POLICY;
		const result = withGlinWarnSuppressed(() => checkProfanity(text, {
			allLanguages: policy.allLanguages,
			languages: policy.languages,
			allowObfuscatedMatch: policy.allowObfuscatedMatch,
			wordBoundaries: policy.wordBoundaries,
			fuzzyToleranceLevel: policy.fuzzyToleranceLevel,
			customWords: options?.customWords
		}));
		const matched = result.containsProfanity ? result.profaneWords : [];
		const ignore = new Set((policy.ignoreWords ?? []).map((word) => word.toLowerCase()));
		const custom = new Set((options?.customWords ?? []).map((word) => word.toLowerCase()));
		const profaneWords = matched.filter((word) => custom.has(word.toLowerCase()) || !ignore.has(word.toLowerCase()));
		return {
			clean: profaneWords.length === 0,
			profaneWords
		};
	} catch {
		return {
			clean: true,
			profaneWords: []
		};
	}
}
//#endregion
//#region src/social/SocialApi.ts
/** Allowed MIME types for file sharing via the SDK bridge. */
const SHARE_FILE_ALLOWED_MIME_TYPES = [
	"video/mp4",
	"image/png",
	"image/jpeg",
	"image/webp",
	"image/gif"
];
/** Max file size in bytes (10 MB). */
const SHARE_FILE_MAX_SIZE_BYTES = 10485760;
/** Platforms a creator can expose a "follow me" link for. */
const FOLLOW_ME_PLATFORMS = [
	"x",
	"instagram",
	"tiktok",
	"discord"
];
/** Platforms accepted as a `composeSocialPostAsync` targeting hint. */
const SOCIAL_COMPOSE_PLATFORMS = [
	"x",
	"reddit",
	"tiktok",
	"instagram"
];
/** Max length for a compose post body, after control characters are stripped. */
const COMPOSE_POST_MAX_TEXT_LENGTH = 500;
/** Max length for a compose post title (used when routed to Reddit). */
const COMPOSE_POST_MAX_TITLE_LENGTH = 300;
/** Valid subreddit names (bare name, no `r/` prefix). */
const COMPOSE_POST_SUBREDDIT_PATTERN = /^[A-Za-z0-9_]{1,21}$/;
//#endregion
//#region src/social/validateShare.ts
const SHARE_PARAMS_MAX_KEYS = 20;
const SHARE_PARAMS_MAX_VALUE_LENGTH = 102400;
const SHARE_PARAMS_MAX_TOTAL_SIZE = 204800;
const META_MAX_TITLE = 200;
const META_MAX_DESCRIPTION = 1e3;
const META_MAX_IMAGE_URL = 2048;
const CLICK_MAX_KEYS = 20;
const CLICK_MAX_KEY_LENGTH = 64;
const CLICK_MAX_VALUE_LENGTH = 1024;
const CLICK_MAX_TOTAL_SIZE = 4096;
function invalid(message) {
	throw new RundotApiError("UNKNOWN", message, 0);
}
function validateShareParams(shareParams) {
	if (shareParams === void 0 || shareParams === null) return;
	if (typeof shareParams !== "object" || Array.isArray(shareParams)) invalid("shareParams must be a plain object");
	const entries = Object.entries(shareParams);
	if (entries.length > SHARE_PARAMS_MAX_KEYS) invalid(`shareParams exceeds maximum of ${SHARE_PARAMS_MAX_KEYS} keys`);
	for (const [key, value] of entries) {
		if (typeof value !== "string") invalid(`shareParams value for key "${key}" must be a string`);
		if (value.length > SHARE_PARAMS_MAX_VALUE_LENGTH) invalid(`shareParams value for key "${key}" exceeds maximum length of 100KB`);
	}
	if (JSON.stringify(shareParams).length > SHARE_PARAMS_MAX_TOTAL_SIZE) invalid("shareParams exceeds maximum serialized size of 200KB");
}
function validateShareIntentParams(shareParams) {
	if (shareParams === void 0 || shareParams === null) invalid("shareParams is required");
	validateShareParams(shareParams);
}
function validateShareTarget(target) {
	if (target === void 0) return;
	if (typeof target !== "object" || target === null || Array.isArray(target)) invalid("target must be a plain object");
	const { format, entryId } = target;
	if (format !== "interactive-fiction" && format !== "video") invalid("target.format must be 'interactive-fiction' or 'video'");
	if (typeof entryId !== "string" || entryId.length === 0) invalid("target.entryId must be a non-empty string");
	if (entryId.includes(":")) invalid("target.entryId must not contain \":\"");
}
function validateShareMetadata(metadata) {
	if (metadata === void 0 || metadata === null) return;
	if (typeof metadata !== "object" || Array.isArray(metadata)) invalid("metadata must be a plain object");
	const m = metadata;
	if (m.title !== void 0 && typeof m.title !== "string") invalid("metadata.title must be a string");
	if (m.description !== void 0 && typeof m.description !== "string") invalid("metadata.description must be a string");
	if (m.imageUrl !== void 0 && typeof m.imageUrl !== "string") invalid("metadata.imageUrl must be a string");
	if (typeof m.title === "string" && m.title.length > META_MAX_TITLE) invalid(`metadata.title exceeds maximum length of ${META_MAX_TITLE}`);
	if (typeof m.description === "string" && m.description.length > META_MAX_DESCRIPTION) invalid(`metadata.description exceeds maximum length of ${META_MAX_DESCRIPTION}`);
	if (typeof m.imageUrl === "string" && m.imageUrl.length > META_MAX_IMAGE_URL) invalid(`metadata.imageUrl exceeds maximum length of ${META_MAX_IMAGE_URL}`);
}
function validateClickMetadata(metadata) {
	if (typeof metadata !== "object" || metadata === null) invalid("metadata must be a non-null object");
	const entries = Object.entries(metadata);
	if (entries.length > CLICK_MAX_KEYS) invalid(`metadata exceeds maximum of ${CLICK_MAX_KEYS} keys`);
	for (const [key, value] of entries) {
		if (typeof value !== "string") invalid(`metadata value for key "${key}" must be a string`);
		if (key.length > CLICK_MAX_KEY_LENGTH) invalid(`metadata key "${key}" exceeds maximum length of ${CLICK_MAX_KEY_LENGTH}`);
		if (value.length > CLICK_MAX_VALUE_LENGTH) invalid(`metadata value for key "${key}" exceeds maximum length of ${CLICK_MAX_VALUE_LENGTH}`);
	}
	if (JSON.stringify(metadata).length > CLICK_MAX_TOTAL_SIZE) invalid(`metadata total size exceeds maximum of ${CLICK_MAX_TOTAL_SIZE} bytes`);
}
function stripComposeControlChars(value) {
	return value.replace(/[\u0000-\u0009\u000B-\u001F\u007F-\u009F]/g, "");
}
function validateComposePost(post) {
	if (typeof post.text !== "string" || post.text.trim().length === 0) throw new Error("text must be a non-empty string");
	if (post.text.length > 500) throw new Error(`text exceeds maximum length of 500`);
	if (post.title !== void 0) {
		if (typeof post.title !== "string") throw new Error("title must be a string");
		if (post.title.length > 300) throw new Error(`title exceeds maximum length of 300`);
	}
	if (post.subreddit !== void 0) {
		if (typeof post.subreddit !== "string" || !COMPOSE_POST_SUBREDDIT_PATTERN.test(post.subreddit)) throw new Error("subreddit must be 1-21 letters, numbers, or underscores (no r/ prefix)");
	}
}
function validateShareFile(options) {
	const { data, mimeType } = options;
	if (!SHARE_FILE_ALLOWED_MIME_TYPES.includes(mimeType)) throw new Error(`unsupported MIME type "${mimeType}". Allowed: ${SHARE_FILE_ALLOWED_MIME_TYPES.join(", ")}`);
	let sizeBytes;
	if (typeof Blob !== "undefined" && data instanceof Blob) sizeBytes = data.size;
	else if (data instanceof ArrayBuffer) sizeBytes = data.byteLength;
	else if (typeof data === "string") {
		const len = data.length;
		const paddingChars = (data[len - 1] === "=" ? 1 : 0) + (data[len - 2] === "=" ? 1 : 0);
		sizeBytes = Math.floor(len * 3 / 4) - paddingChars;
	} else return;
	if (sizeBytes > 10485760) throw new Error(`file size (${sizeBytes} bytes) exceeds max allowed (${SHARE_FILE_MAX_SIZE_BYTES} bytes)`);
}
//#endregion
//#region src/social/composeUrl.ts
/**
* X (Twitter) web intent. The tracked link goes in `url` so it stays out of
* the 280-char text budget.
*/
function buildXComposerUrl(text, link) {
	const params = new URLSearchParams({ text });
	if (link) params.set("url", link);
	return `https://x.com/intent/post?${params.toString()}`;
}
/**
* Reddit submit page. Title falls back to the first 300 chars of the text;
* the tracked link is appended to the body.
*/
function buildRedditComposerUrl(options) {
	const { text, link, title, subreddit } = options;
	const params = new URLSearchParams({
		title: title || text.slice(0, 300),
		text: link ? `${text}\n\n${link}` : text
	});
	return `${subreddit ? `https://www.reddit.com/r/${subreddit}/submit` : "https://www.reddit.com/submit"}?${params.toString()}`;
}
//#endregion
//#region src/access-gate/AccessTier.ts
var AccessDeniedError = class extends Error {
	requiredTier;
	action;
	constructor(requiredTier, action) {
		super(`[RUN] Access denied. Required tier: ${requiredTier}. Action: ${action}`);
		this.name = "AccessDeniedError";
		this.requiredTier = requiredTier;
		this.action = action;
	}
};
//#endregion
//#region src/access-gate/createAccessGatedApi.ts
function createAccessGatedApi(api, gatedMethods, requiredTier, config) {
	const gatedSet = new Set(gatedMethods);
	return new Proxy(api, { get(target, prop, receiver) {
		const value = Reflect.get(target, prop, receiver);
		if (!gatedSet.has(prop) || typeof value !== "function") return value;
		return function gatedCall(...args) {
			if (!config.isAnonymous()) return value.apply(target, args);
			const action = "prompt_login";
			if (!config.isAutoPromptEnabled()) return Promise.reject(new AccessDeniedError(requiredTier, action));
			return (async () => {
				if (!(await config.promptLogin()).success) throw new AccessDeniedError(requiredTier, action);
				return value.apply(target, args);
			})();
		};
	} });
}
//#endregion
//#region src/access-gate/gateStreaming.ts
/**
* Gates a streaming (AsyncIterable-returning) method without breaking the
* `for await` contract. `createAccessGatedApi` cannot wrap streaming methods
* because it returns Promises, and a `Promise<AsyncIterable>` is not itself
* iterable. Instead this returns a fresh AsyncIterable whose iterator runs the
* access check on first iteration — prompting (and resolving sign-in) BEFORE
* the underlying stream is started, so the host opens the stream with the
* now-authenticated token. On denial it throws and never touches the stream.
*/
function gateStreaming(streamFn, config, requiredTier = "authenticated_18plus") {
	return (...args) => ({ async *[Symbol.asyncIterator]() {
		if (config.isAnonymous()) {
			if (!config.isAutoPromptEnabled()) throw new AccessDeniedError(requiredTier, "prompt_login");
			if (!(await config.promptLogin()).success) throw new AccessDeniedError(requiredTier, "prompt_login");
		}
		yield* streamFn(...args);
	} });
}
//#endregion
//#region src/access-gate/applyAccessGates.ts
const GATED_MULTIPLAYER_METHODS = {
	createRoom: "ticket-minting",
	joinOrCreateRoom: "ticket-minting",
	joinRoomByCode: "ticket-minting",
	matchmakeRoom: "ticket-minting",
	getUserRooms: "listing"
};
const GATED_IMAGE_GEN_METHODS = {
	generate: "gated",
	estimateDepth: "gated",
	removeBackground: "gated",
	upscaleImage: "gated",
	listModels: "ungated",
	getCompletedJobs: "ungated"
};
/**
* Wraps gated API methods on a host with access-gate checks.
* Call this once during host construction, after all API instances
* and the accessGate have been assigned.
*/
function applyAccessGates(host) {
	const gateConfig = {
		isAnonymous: () => host.accessGate.isAnonymous(),
		promptLogin: () => host.accessGate.promptLogin(),
		isAutoPromptEnabled: () => host.accessGate.autoPromptLogin
	};
	const baseTextGen = host.textGen;
	const gatedStream = gateStreaming((request, options) => baseTextGen.requestChatCompletionStreamAsync(request, options), gateConfig);
	const gatedPromptStream = gateStreaming((request, options) => baseTextGen.requestPromptCompletionStreamAsync(request, options), gateConfig);
	const gatedTextGen = createAccessGatedApi(baseTextGen, [
		"requestChatCompletionAsync",
		"requestPromptCompletionAsync",
		"getAvailableCompletionModels",
		"decide"
	], "authenticated_18plus", gateConfig);
	host.textGen = new Proxy(gatedTextGen, { get(target, prop, receiver) {
		if (prop === "requestChatCompletionStreamAsync") return gatedStream;
		if (prop === "requestPromptCompletionStreamAsync") return gatedPromptStream;
		return Reflect.get(target, prop, receiver);
	} });
	const imageGenKeys = Object.keys(GATED_IMAGE_GEN_METHODS);
	host.imageGen = createAccessGatedApi(host.imageGen, imageGenKeys.filter((k) => GATED_IMAGE_GEN_METHODS[k] === "gated"), "authenticated_18plus", gateConfig);
	host.audioGen = createAccessGatedApi(host.audioGen, [
		"generate",
		"designVoices",
		"saveDesignedVoice"
	], "authenticated_18plus", gateConfig);
	host.spriteGen = createAccessGatedApi(host.spriteGen, ["generate", "animate"], "authenticated_18plus", gateConfig);
	host.threeDGen = createAccessGatedApi(host.threeDGen, [
		"generate",
		"remesh",
		"rig",
		"animate"
	], "authenticated_18plus", gateConfig);
	host.ugc = createAccessGatedApi(host.ugc, [
		"create",
		"update",
		"delete",
		"like",
		"unlike",
		"report"
	], "authenticated_18plus", gateConfig);
	host.rooms = createAccessGatedApi(host.rooms, [
		"createRoomAsync",
		"joinOrCreateRoomAsync",
		"joinRoomByCodeAsync",
		"getUserRoomsAsync",
		"subscribeAsync",
		"updateRoomDataAsync",
		"getRoomDataAsync",
		"sendRoomMessageAsync",
		"leaveRoomAsync",
		"kickPlayerAsync",
		"startRoomGameAsync",
		"proposeMoveAsync",
		"validateMoveAsync"
	], "authenticated_18plus", gateConfig);
	const multiplayerKeys = Object.keys(GATED_MULTIPLAYER_METHODS);
	const ticketMinting = multiplayerKeys.filter((k) => GATED_MULTIPLAYER_METHODS[k] === "ticket-minting");
	const listing = multiplayerKeys.filter((k) => GATED_MULTIPLAYER_METHODS[k] === "listing");
	const multiplayerGateConfig = {
		...gateConfig,
		isAnonymous: () => gateConfig.isAnonymous() && !(host.anonymousMultiplayerAllowed?.() ?? false)
	};
	host.multiplayer = createAccessGatedApi(host.multiplayer, ticketMinting, "authenticated_18plus", multiplayerGateConfig);
	host.multiplayer = createAccessGatedApi(host.multiplayer, listing, "authenticated_18plus", gateConfig);
}
//#endregion
//#region src/access-gate/MockAccessGateApi.ts
var MockAccessGateApi = class {
	rundotGameApi;
	autoPromptLogin = true;
	constructor(rundotGameApi) {
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
		if ((this.rundotGameApi._mock?.accessGate)?.simulateLoginSuccess) {
			if (this.rundotGameApi._profileData) this.rundotGameApi._profileData = {
				...this.rundotGameApi._profileData,
				isAnonymous: false
			};
			console.warn("[RUN:mock] accessGate.promptLogin() simulated successful login");
			return {
				success: true,
				profile: this.rundotGameApi._profileData
			};
		}
		console.warn("[RUN:mock] accessGate.promptLogin() called — returning false. Set _mock.accessGate.simulateLoginSuccess = true to simulate a successful login.");
		return { success: false };
	}
};
//#endregion
//#region src/mp/client/RundotServerRoom.ts
var RundotServerRoom = class RundotServerRoom {
	/** The shareable room code (e.g. "HX9KWR"). Updated if the server moves us. */
	roomCode;
	playerId;
	ws;
	_locked = false;
	playersById = /* @__PURE__ */ new Map();
	_maxPlayers;
	_isCreator;
	_phase = "active";
	events = {};
	rawHandlers = /* @__PURE__ */ new Map();
	pendingRaw = /* @__PURE__ */ new Map();
	static MAX_PENDING_RAW = 256;
	static MAX_PENDING_RAW_TYPES = 32;
	pingInterval = null;
	lastPingTs = 0;
	_latency = 0;
	_serverTimeOffset = 0;
	/** Set to true to enable debug logging */
	static debug = false;
	log(msg) {
		if (RundotServerRoom.debug) console.warn(`[RUN:transport] ${msg}`);
	}
	warn(msg) {
		if (RundotServerRoom.debug) console.warn(`[RUN:transport] ${msg}`);
	}
	toMessage(msgType, data) {
		return {
			...data,
			type: msgType
		};
	}
	/**
	* Attempt a phase transition. Returns true if the transition occurred.
	* Once `dead`, no further transitions are allowed.
	*/
	transitionTo(newPhase) {
		if (this._phase === "dead" || this._phase === newPhase) return false;
		this.log(`phase ${this._phase} → ${newPhase}`);
		this._phase = newPhase;
		return true;
	}
	constructor(joined, ws) {
		this.roomCode = joined.roomCode;
		this.playerId = joined.playerId;
		this.ws = ws;
		this._locked = joined.locked ?? false;
		this._maxPlayers = joined.maxPlayers ?? 1;
		this._isCreator = joined.isCreator ?? false;
		for (const player of joined.players ?? [{
			id: joined.playerId,
			username: ""
		}]) this.playersById.set(player.id, { ...player });
		this.log(`created roomCode=${joined.roomCode} playerId=${joined.playerId}`);
		ws.on({
			onMessage: (msg) => this.onMessageReceived(msg),
			onStateChange: (state) => this.onConnectionStateChanged(state),
			onError: (err) => this.onError(err)
		});
		this.startPing();
	}
	/** Whether the room is locked */
	get locked() {
		return this._locked;
	}
	get players() {
		return [...this.playersById.values()];
	}
	get maxPlayers() {
		return this._maxPlayers;
	}
	get isCreator() {
		return this._isCreator;
	}
	/** Current latency in ms (round-trip / 2) */
	get latency() {
		return this._latency;
	}
	/** Connection state */
	get connectionState() {
		return this.ws.state;
	}
	/**
	* Register event handlers.
	*/
	on(events) {
		this.events = {
			...this.events,
			...events
		};
	}
	/**
	* Send a typed message to the server room.
	*/
	send(message) {
		if (this._phase === "dead" || this._phase === "reconnecting") return;
		const { type, ...data } = message;
		this.ws.send({
			type: "message",
			msgType: type,
			data
		});
	}
	setSeatingOpen(open) {
		if (this._phase === "dead" || this._phase === "reconnecting") return;
		this.ws.send({
			type: "room:setSeatingOpen",
			open
		});
	}
	/**
	* Send an opaque payload under `msgType`, bypassing the typed-message
	* `{ type, ...data }` transform so a raw string survives the round trip.
	*/
	sendRaw(msgType, data) {
		if (this._phase === "dead" || this._phase === "reconnecting") return;
		this.ws.send({
			type: "message",
			msgType,
			data
		});
	}
	/**
	* Register a raw handler for `msgType`. When a broadcast/sendTo arrives with a
	* matching `msgType`, its payload is delivered here untouched and the typed
	* `onMessage`/`onPrivateMessage` path is skipped for that message.
	*/
	onRaw(msgType, handler) {
		this.rawHandlers.set(msgType, handler);
		const buffered = this.pendingRaw.get(msgType);
		if (buffered) {
			this.pendingRaw.delete(msgType);
			for (const data of buffered) handler(data);
		}
	}
	/**
	* Deliver a raw payload for `msgType`. If a handler is registered, invoke it and
	* report handled=true so the typed `toMessage` path is skipped. Otherwise retain
	* the payload (bounded) so a later {@link onRaw} still receives it, and report
	* handled=false so the typed path also runs — a msgType no raw consumer ever claims
	* is delivered normally, and the retained copy is simply never drained.
	*/
	deliverRaw(msgType, data) {
		const handler = this.rawHandlers.get(msgType);
		if (handler) {
			handler(data);
			return true;
		}
		let buffered = this.pendingRaw.get(msgType);
		if (buffered === void 0) {
			if (this.pendingRaw.size >= RundotServerRoom.MAX_PENDING_RAW_TYPES) return false;
			buffered = [];
			this.pendingRaw.set(msgType, buffered);
		}
		if (buffered.length < RundotServerRoom.MAX_PENDING_RAW) buffered.push(data);
		return false;
	}
	/** Send a room chat message (Req 20). Delivered back to all members via onChat. */
	sendChat(text) {
		if (this._phase === "dead" || this._phase === "reconnecting") return;
		this.ws.send({
			type: "message",
			msgType: "chat:send",
			data: { text }
		});
	}
	/** Request recent chat history; reply arrives on onChatHistory. */
	fetchChatHistory(limit) {
		if (this._phase === "dead" || this._phase === "reconnecting") return;
		this.ws.send({
			type: "message",
			msgType: "chat:history",
			data: { limit }
		});
	}
	/**
	* Leave the room and close the connection.
	*/
	leave() {
		if (this._phase === "dead") return;
		this._phase = "dead";
		this.stopPing();
		this.ws.close();
	}
	/**
	* Get estimated server time (local time + offset).
	*/
	getServerTime() {
		return Date.now() + this._serverTimeOffset;
	}
	onMessageReceived(msg) {
		if (msg.type !== "pong") this.log(`handleMessage type=${msg.type}`);
		switch (msg.type) {
			case "room:broadcast":
				this.onBroadcastMessageReceived(msg);
				break;
			case "room:sendTo":
				this.onSendToMessageReceived(msg);
				break;
			case "room:lock":
				this.onLockMessageReceived();
				break;
			case "room:unlock":
				this.onUnlockMessageReceived();
				break;
			case "room:playerJoined":
				this.onPlayerJoinedMessageReceived(msg);
				break;
			case "room:playerLeft":
				this.onPlayerLeftMessageReceived(msg);
				break;
			case "room:error":
				this.onErrorMessageReceived(msg);
				break;
			case "room:reconnecting":
				this.onReconnectingMessageReceived();
				break;
			case "room:moved":
				this.onMovedMessageReceived(msg);
				break;
			case "room:reconnected":
				this.onReconnectedMessageReceived(msg);
				break;
			case "pong":
				this.onPongMessageReceived(msg);
				break;
			case "chat:message":
				this.events.onChat?.(msg.data);
				break;
			case "chat:history": this.events.onChatHistory?.(msg.data.messages);
		}
	}
	onBroadcastMessageReceived(msg) {
		this.log(`broadcast msgType=${msg.msgType}`);
		if (this.deliverRaw(msg.msgType, msg.data)) return;
		if (msg.msgType === "world:delta") {
			const data = msg.data;
			this.events.onDelta?.(data?.delta ?? msg.data);
			return;
		}
		if (msg.msgType === "world:resync") {
			const data = msg.data;
			this.events.onResync?.(data?.reason ?? "resync");
			return;
		}
		this.events.onMessage?.(this.toMessage(msg.msgType, msg.data));
	}
	onSendToMessageReceived(msg) {
		this.log(`sendTo msgType=${msg.msgType}`);
		if (this.deliverRaw(msg.msgType, msg.data)) return;
		this.events.onPrivateMessage?.(this.toMessage(msg.msgType, msg.data));
	}
	onLockMessageReceived() {
		this._locked = true;
		this.log(`room locked`);
		this.events.onLock?.();
	}
	onUnlockMessageReceived() {
		this._locked = false;
		this.log(`room unlocked`);
		this.events.onUnlock?.();
	}
	onPlayerJoinedMessageReceived(msg) {
		this.log(`playerJoined id=${msg.playerId}`);
		const player = {
			id: msg.playerId,
			username: msg.username,
			avatarUrl: msg.avatarUrl
		};
		this.playersById.set(msg.playerId, player);
		this.events.onPlayerJoined?.(player);
	}
	onPlayerLeftMessageReceived(msg) {
		this.log(`playerLeft id=${msg.playerId}`);
		this.playersById.delete(msg.playerId);
		this.events.onPlayerLeft?.(msg.playerId);
	}
	onErrorMessageReceived(msg) {
		if (msg.code === "DUPLICATE_SESSION" && this._phase === "reconnecting") {
			this.warn(`transient reconnect rejection: ${msg.message}`);
			return;
		}
		this.warn(`error: ${msg.message}`);
		this.events.onError?.(msg.message);
	}
	onReconnectingMessageReceived() {
		if (this.transitionTo("reconnecting")) this.events.onReconnecting?.();
	}
	onMovedMessageReceived(msg) {
		this.log(`moved to room=${msg._roomId} code=${msg.roomCode}`);
		this.roomCode = msg.roomCode;
		this.ws.retargetRoom(msg._roomId, msg.roomCode);
		this.events.onMoved?.(msg._roomId);
	}
	onReconnectedMessageReceived(_msg) {
		this.ws.confirmConnection();
		if (this.transitionTo("active")) this.events.onReconnected?.();
	}
	onPongMessageReceived(msg) {
		const now = Date.now();
		const rtt = now - msg.ts;
		this._latency = Math.round(rtt / 2);
		this._serverTimeOffset = msg.serverTs - now + this._latency;
	}
	onError(err) {
		this.warn(`ws error: ${err.message}`);
		this.events.onError?.(err.message);
	}
	onConnectionStateChanged(state) {
		this.log(`connectionState=${state}`);
		switch (state) {
			case "connected":
				this.onConnectedStateEntered();
				break;
			case "disconnected":
				this.onDisconnectedStateEntered();
				break;
			case "reconnecting": this.onReconnectingStateEntered();
		}
	}
	onConnectedStateEntered() {
		this.startPing();
	}
	onDisconnectedStateEntered() {
		this.stopPing();
		if (this.transitionTo("dead")) this.events.onDisconnect?.();
	}
	onReconnectingStateEntered() {
		this.stopPing();
		if (this.transitionTo("reconnecting")) this.events.onReconnecting?.();
	}
	startPing() {
		if (this.pingInterval) return;
		this.pingInterval = setInterval(() => {
			this.lastPingTs = Date.now();
			this.ws.send({
				type: "ping",
				ts: this.lastPingTs
			});
		}, 5e3);
	}
	stopPing() {
		if (this.pingInterval) {
			clearInterval(this.pingInterval);
			this.pingInterval = null;
		}
	}
};
//#endregion
//#region src/mp/client/ServerWebSocket.ts
var ServerWebSocket = class {
	ws = null;
	url;
	maxReconnectAttempts;
	initialReconnectDelay;
	maxReconnectDelay;
	reconnectAttempts = 0;
	reconnectTimer = null;
	disposed = false;
	events = {};
	_state = "disconnected";
	_getJoinTicket;
	_authMessage;
	/**
	* Original matchmaking intent for ticket re-minting on reconnect. The auth
	* frame deliberately does NOT carry criteria/createOptions, so they are kept
	* here and replayed into the reconnect JoinTicketRequest — a criteria-game
	* that drops into the createRoom fallthrough must re-matchmake with intent.
	*/
	_joinOptions;
	_isReconnect = false;
	_authenticated = false;
	constructor(options) {
		this.url = options.url;
		this.maxReconnectAttempts = options.maxReconnectAttempts ?? 10;
		this.initialReconnectDelay = options.initialReconnectDelay ?? 100;
		this.maxReconnectDelay = options.maxReconnectDelay ?? 5e3;
		this._authMessage = options.authMessage;
	}
	get state() {
		return this._state;
	}
	/**
	* Set event handlers.
	*/
	on(events) {
		this.events = {
			...this.events,
			...events
		};
	}
	/**
	* Set the join ticket provider for reconnections.
	*/
	setTicketProvider(fn) {
		this._getJoinTicket = fn;
	}
	/**
	* Retain the original matchmaking criteria/create-options so the reconnect
	* ticket is re-minted with the same intent as the initial join.
	*/
	setJoinOptions(opts) {
		this._joinOptions = opts;
	}
	/**
	* Set the auth message to send on connect.
	*/
	setAuthMessage(msg) {
		this._authMessage = msg;
	}
	/**
	* Retarget the room a reconnect resumes after a server-driven move
	* (move_player / Req 19). The socket itself is unchanged; this only updates
	* the `_roomId`/`roomCode` replayed in the reconnect auth frame.
	*/
	retargetRoom(roomId, roomCode) {
		if (!this._authMessage) return;
		this._authMessage = {
			...this._authMessage,
			_roomId: roomId,
			roomCode
		};
	}
	/**
	* Connect to the WebSocket server.
	* On reconnection, sends a fresh auth token with { reconnect: true }.
	*/
	connect() {
		if (this.disposed) return;
		this._authenticated = false;
		this.setState(this._isReconnect ? "reconnecting" : "connecting");
		try {
			if (this.ws) {
				this.ws.onopen = null;
				this.ws.onmessage = null;
				this.ws.onclose = null;
				this.ws.onerror = null;
				this.ws = null;
			}
			const socket = new WebSocket(this.url);
			this.ws = socket;
			socket.onopen = () => this.onOpen(socket);
			socket.onmessage = (event) => this.onMessage(event);
			socket.onclose = (event) => this.onClose(event);
			socket.onerror = () => this.onError();
		} catch (err) {
			console.error(`[RUN:transport] connect() threw`, err);
			this.events.onError?.(err instanceof Error ? err : /* @__PURE__ */ new Error("Failed to connect"));
			this.attemptReconnect();
		}
	}
	/**
	* Send a message to the server.
	*/
	send(msg) {
		if (this.ws && this.ws.readyState === WebSocket.OPEN && this._authenticated) this.ws.send(JSON.stringify(msg));
	}
	/**
	* Reset the reconnect counter after the server confirms the connection is valid.
	*/
	confirmConnection() {
		this.reconnectAttempts = 0;
	}
	/**
	* Close the connection. Does not attempt reconnection.
	*/
	close() {
		this.disposed = true;
		if (this.reconnectTimer) {
			clearTimeout(this.reconnectTimer);
			this.reconnectTimer = null;
		}
		if (this.ws) {
			this.ws.close(1e3, "Client closed");
			this.ws = null;
		}
		this.setState("disconnected");
	}
	async onOpen(socket) {
		if (this._isReconnect && this._authMessage && this._getJoinTicket) try {
			const req = {
				roomType: this._authMessage.roomType,
				roomCode: this._authMessage.roomCode,
				action: this._authMessage.action || "joinOrCreate",
				criteria: this._joinOptions?.criteria,
				createOptions: this._joinOptions?.createOptions,
				persistentKey: this._joinOptions?.persistentKey,
				_roomId: this._authMessage._roomId,
				reconnect: true
			};
			const freshTicket = await this._getJoinTicket(req);
			if (this.ws !== socket || socket.readyState !== WebSocket.OPEN) return;
			const authMsg = {
				...this._authMessage,
				ticket: freshTicket,
				reconnect: true
			};
			socket.send(JSON.stringify(authMsg));
			this._authenticated = true;
		} catch {
			console.error(`[RUN:transport] failed to get join ticket for reconnection`);
			socket.close();
			return;
		}
		else if (this._authMessage) {
			if (socket.readyState === WebSocket.OPEN) {
				socket.send(JSON.stringify(this._authMessage));
				this._authenticated = true;
			}
		}
		if (this.ws !== socket) return;
		this.setState("connected");
	}
	onMessage(event) {
		try {
			const msg = JSON.parse(event.data);
			this.events.onMessage?.(msg);
		} catch {
			console.warn(`[RUN:transport] failed to parse message`);
		}
	}
	onClose(event) {
		console.warn(`[RUN:transport] onclose code=${event.code} reason=${event.reason} disposed=${this.disposed}`);
		this._authenticated = false;
		if (this.disposed) {
			this.setState("disconnected");
			return;
		}
		this.attemptReconnect();
	}
	onError() {
		console.warn(`[RUN:transport] onerror; awaiting close before reconnecting`);
	}
	attemptReconnect() {
		if (this.disposed) return;
		if (this.reconnectAttempts >= this.maxReconnectAttempts) {
			console.error(`[RUN:transport] max reconnect attempts (${this.maxReconnectAttempts}) exceeded`);
			this._isReconnect = false;
			this.setState("disconnected");
			this.events.onError?.(/* @__PURE__ */ new Error("Max reconnection attempts exceeded"));
			return;
		}
		this._isReconnect = true;
		this.setState("reconnecting");
		this.reconnectAttempts++;
		const delay = Math.min(this.initialReconnectDelay * Math.pow(2, this.reconnectAttempts - 1), this.maxReconnectDelay);
		console.warn(`[RUN:transport] reconnecting attempt=${this.reconnectAttempts}/${this.maxReconnectAttempts} delay=${delay}ms`);
		this.reconnectTimer = setTimeout(() => {
			this.connect();
		}, delay);
	}
	setState(state) {
		if (this._state !== state) {
			this._state = state;
			this.events.onStateChange?.(state);
		}
	}
};
//#endregion
//#region src/mp/client/playgroundDuplicateSessionHint.ts
/**
* Playground-only DUPLICATE_SESSION guidance.
*
* The room server rejects a second join for an identity already seated in the
* room. In the playground the cause is almost always two clients on the single
* base identity (the coordinator's localStorage registry isn't shared across
* browsers/profiles/automation contexts, so each claims slot 0). The server
* message says WHAT happened; this hint says how to fix it, pointing at the
* canonical testing patterns. Gated on the playground global so the real RUN
* client (RemoteHost — never sets it) is unaffected, and deduped per page load
* so reconnect retries don't spam the console.
*/
let logged = false;
function maybeLogPlaygroundDuplicateSessionHint(code) {
	if (code !== "DUPLICATE_SESSION" || logged) return;
	if (typeof window === "undefined") return;
	if (!window.__RUNDOT_GAME_PLAYGROUND__?.enabled) return;
	logged = true;
	console.warn("[RUN:playground] DUPLICATE_SESSION: two clients joined with the SAME player identity. Every browser instance sharing one playground base identity (one Google account or one pk_ key) needs its own player. Canonical fixes (see \"Test multiple players\" in the playground docs):\n  • Same browser: open players as tabs in one window — distinct players are assigned automatically.\n  • Separate browsers/profiles/automation contexts: pin each one with a distinct value, e.g. ?rundotPlayer=player2 (any [a-zA-Z0-9_]{1,32} value, unique per instance).");
}
//#endregion
//#region src/mp/client/WsMultiplayerApi.ts
var WsMultiplayerApi = class {
	serverUrl;
	getJoinTicket;
	listUserRooms;
	constructor(config) {
		this.serverUrl = config.serverUrl;
		this.getJoinTicket = config.getJoinTicket;
		this.listUserRooms = config.listUserRooms;
	}
	resolveServerUrl() {
		return typeof this.serverUrl === "function" ? this.serverUrl() : this.serverUrl;
	}
	async createRoom(roomType, opts) {
		return this._joinWithAction("create", roomType, void 0, opts);
	}
	async joinRoomByCode(code) {
		return this._joinWithAction("joinByCode", "", code);
	}
	async joinOrCreateRoom(roomType, opts) {
		return this._joinWithAction("joinOrCreate", roomType, void 0, opts);
	}
	async matchmakeRoom(roomType, opts) {
		const req = {
			roomType,
			action: "matchmake",
			criteria: opts?.criteria
		};
		const ticket = await this.getJoinTicket(req);
		return this._connectMatchmaking({
			type: "auth",
			protocolVersion: 1,
			ticket,
			roomType,
			action: "matchmake"
		}, opts);
	}
	async getUserRooms(options) {
		if (!this.listUserRooms) throw new Error("getUserRooms is not available in this environment");
		return this.listUserRooms(options);
	}
	async _joinWithAction(action, roomType, roomCode, opts) {
		const req = {
			roomType,
			action,
			roomCode,
			criteria: opts?.criteria,
			createOptions: opts?.createOptions,
			persistentKey: opts?.persistentKey
		};
		const ticket = await this.getJoinTicket(req);
		return this._connect({
			type: "auth",
			protocolVersion: 1,
			ticket,
			roomType,
			action,
			roomCode
		}, opts);
	}
	/**
	* Matchmaking connect (Req 18): like {@link _connect} but the socket parks in
	* the server lobby until paired. While the server reports `matchmaking:pending`
	* the client polls the pool; once the server pairs and emits `room:joined` the
	* room resolves. The waiting window is `matchmakeTimeoutMs` (default 120s),
	* deliberately longer than the plain connect timeout.
	*/
	_connectMatchmaking(authMsg, opts, retryCount = 0) {
		const ws = new ServerWebSocket({ url: this.resolveServerUrl().replace(/^http/, "ws") + "/ws" });
		ws.setTicketProvider(this.getJoinTicket);
		ws.setJoinOptions({ criteria: opts?.criteria });
		const timeoutMs = opts?.matchmakeTimeoutMs ?? 12e4;
		const pollIntervalMs = opts?.pollIntervalMs ?? 1e3;
		return new Promise((resolve, reject) => {
			let resolved = false;
			let pollTimer = null;
			const stopPolling = () => {
				if (pollTimer) {
					clearInterval(pollTimer);
					pollTimer = null;
				}
			};
			const startPolling = () => {
				if (pollTimer) return;
				pollTimer = setInterval(() => {
					ws.send({
						type: "message",
						msgType: "matchmaking:poll",
						data: {}
					});
				}, pollIntervalMs);
			};
			const timeout = setTimeout(() => {
				if (!resolved) {
					resolved = true;
					stopPolling();
					ws.send({
						type: "message",
						msgType: "matchmaking:cancel",
						data: {}
					});
					ws.close();
					reject(/* @__PURE__ */ new Error("Matchmaking timeout — no opponent found"));
				}
			}, timeoutMs);
			const settle = (fn) => {
				if (resolved) return;
				resolved = true;
				stopPolling();
				clearTimeout(timeout);
				fn();
			};
			const handlePreJoinMessage = (msg) => {
				if (resolved) return;
				switch (msg.type) {
					case "room:joined": {
						ws.setAuthMessage({
							...authMsg,
							_roomId: msg._roomId
						});
						const room = new RundotServerRoom(msg, ws);
						settle(() => resolve(room));
						break;
					}
					case "matchmaking:pending":
						startPolling();
						break;
					case "matchmaking:idle":
						ws.close();
						settle(() => reject(/* @__PURE__ */ new Error("Matchmaking is no longer active (pool expired or cancelled)")));
						break;
					case "matchmaking:cancelled":
						ws.close();
						settle(() => reject(/* @__PURE__ */ new Error("Matchmaking cancelled")));
						break;
					case "room:error":
						maybeLogPlaygroundDuplicateSessionHint(msg.code);
						ws.close();
						if (msg.code === "DUPLICATE_SESSION" && retryCount === 0) {
							console.warn(`[WsMultiplayerApi] DUPLICATE_SESSION in matchmaking, retrying join in 1.5s...`);
							settle(() => {
								setTimeout(async () => {
									try {
										let freshAuthMsg = authMsg;
										if (this.getJoinTicket && authMsg.roomType) {
											const freshTicket = await this.getJoinTicket({
												roomType: authMsg.roomType,
												action: "matchmake",
												criteria: opts?.criteria
											});
											freshAuthMsg = {
												...authMsg,
												ticket: freshTicket
											};
										}
										resolve(await this._connectMatchmaking(freshAuthMsg, opts, retryCount + 1));
									} catch (err) {
										reject(err);
									}
								}, 1500);
							});
							return;
						}
						settle(() => reject(new Error(msg.message)));
				}
			};
			const handlePreJoinError = (err) => {
				if (!resolved) {
					ws.close();
					settle(() => reject(err));
				}
			};
			ws.on({
				onMessage: handlePreJoinMessage,
				onError: handlePreJoinError,
				onStateChange: () => {}
			});
			ws.setAuthMessage(authMsg);
			ws.connect();
		});
	}
	_connect(authMsg, opts, retryCount = 0) {
		const ws = new ServerWebSocket({ url: this.resolveServerUrl().replace(/^http/, "ws") + "/ws" });
		ws.setTicketProvider(this.getJoinTicket);
		ws.setJoinOptions({
			criteria: opts?.criteria,
			createOptions: opts?.createOptions,
			persistentKey: opts?.persistentKey
		});
		return new Promise((resolve, reject) => {
			let resolved = false;
			const timeout = setTimeout(() => {
				if (!resolved) {
					console.error(`[WsMultiplayerApi] connection timeout (15s)`);
					resolved = true;
					ws.close();
					reject(/* @__PURE__ */ new Error("Connection timeout"));
				}
			}, 15e3);
			const settle = (fn) => {
				if (resolved) return;
				resolved = true;
				clearTimeout(timeout);
				fn();
			};
			const handlePreJoinMessage = (msg) => {
				if (resolved) return;
				if (msg.type === "room:joined") {
					ws.setAuthMessage({
						...authMsg,
						_roomId: msg._roomId
					});
					const room = new RundotServerRoom(msg, ws);
					settle(() => resolve(room));
				} else if (msg.type === "room:error") {
					maybeLogPlaygroundDuplicateSessionHint(msg.code);
					console.error(`[WsMultiplayerApi] room:error code=${msg.code} message=${msg.message}`);
					ws.close();
					if (msg.code === "DUPLICATE_SESSION" && retryCount === 0) {
						console.warn(`[WsMultiplayerApi] DUPLICATE_SESSION encountered, retrying join in 1.5s...`);
						settle(() => {
							setTimeout(async () => {
								try {
									let freshAuthMsg = authMsg;
									if (this.getJoinTicket && (authMsg.roomType || authMsg.action === "joinByCode" || authMsg.roomCode)) {
										const freshTicket = await this.getJoinTicket({
											roomType: authMsg.roomType || "",
											action: authMsg.action || "joinOrCreate",
											roomCode: authMsg.roomCode,
											criteria: opts?.criteria,
											createOptions: opts?.createOptions,
											persistentKey: opts?.persistentKey
										});
										freshAuthMsg = {
											...authMsg,
											ticket: freshTicket
										};
									}
									resolve(await this._connect(freshAuthMsg, opts, retryCount + 1));
								} catch (err) {
									reject(err);
								}
							}, 1500);
						});
						return;
					}
					settle(() => reject(new Error(msg.message)));
				}
			};
			const handlePreJoinError = (err) => {
				console.error(`[WsMultiplayerApi] onError`, err);
				if (!resolved) {
					ws.close();
					settle(() => reject(err));
				}
			};
			const handleStateChange = (_state) => {};
			ws.on({
				onMessage: handlePreJoinMessage,
				onError: handlePreJoinError,
				onStateChange: handleStateChange
			});
			ws.setAuthMessage(authMsg);
			ws.connect();
		});
	}
};
//#endregion
//#region src/mp/client/validateRoomOptions.ts
const MAX_CRITERIA_KEYS = 16;
const MAX_CRITERIA_VALUE_LENGTH = 256;
const MAX_METADATA_KEYS = 32;
function isPlainObject(v) {
	return typeof v === "object" && v !== null && !Array.isArray(v);
}
function validateRoomOptions(opts) {
	if (!opts) return;
	if (opts.criteria !== void 0) {
		if (!isPlainObject(opts.criteria)) throw new Error("criteria must be an object");
		const entries = Object.entries(opts.criteria);
		if (entries.length > MAX_CRITERIA_KEYS) throw new Error(`criteria may not exceed ${MAX_CRITERIA_KEYS} keys`);
		for (const [key, value] of entries) {
			if (typeof value !== "string" && typeof value !== "number") throw new Error(`criteria value for "${key}" must be a string or number`);
			if (typeof value === "string" && value.length > MAX_CRITERIA_VALUE_LENGTH) throw new Error(`criteria value for "${key}" is too long`);
		}
	}
	if (opts.createOptions !== void 0) {
		const co = opts.createOptions;
		if (!isPlainObject(co)) throw new Error("createOptions must be an object");
		if (co.maxPlayers !== void 0) {
			if (typeof co.maxPlayers !== "number" || !Number.isInteger(co.maxPlayers) || co.maxPlayers <= 0) throw new Error("createOptions.maxPlayers must be a positive integer");
		}
		if (co.isPrivate !== void 0 && typeof co.isPrivate !== "boolean") throw new Error("createOptions.isPrivate must be a boolean");
		if (co.metadata !== void 0) {
			if (!isPlainObject(co.metadata)) throw new Error("createOptions.metadata must be an object");
			if (Object.keys(co.metadata).length > MAX_METADATA_KEYS) throw new Error(`createOptions.metadata may not exceed ${MAX_METADATA_KEYS} keys`);
		}
	}
	if (opts.persistentKey !== void 0 && (typeof opts.persistentKey !== "string" || opts.persistentKey.length === 0)) throw new Error("persistentKey must be a non-empty string");
}
//#endregion
//#region src/mp/client/MockMultiplayerApi.ts
const FAKE_PROFILE_SESSION_KEY = "__rundot_fake_tab_profile__";
function getOrCreateFakeTabProfile() {
	try {
		const stored = typeof sessionStorage !== "undefined" ? sessionStorage.getItem(FAKE_PROFILE_SESSION_KEY) : null;
		if (stored) return JSON.parse(stored);
	} catch {}
	const suffix = Math.random().toString(16).slice(2, 6);
	const profile = {
		id: `dev-tab-${suffix}`,
		username: `Dev Player ${suffix.toUpperCase()}`,
		avatarUrl: null
	};
	try {
		if (typeof sessionStorage !== "undefined") sessionStorage.setItem(FAKE_PROFILE_SESSION_KEY, JSON.stringify(profile));
	} catch {}
	return profile;
}
function isPlaygroundActive() {
	return typeof window !== "undefined" && !!window.__RUNDOT_GAME_PLAYGROUND__?.enabled;
}
function readDevServerUrl() {
	return typeof window !== "undefined" ? window.__RUNDOT_MULTIPLAYER_DEV_SERVER__ : void 0;
}
function resolveDevIdentity(getProfile) {
	if (!isPlaygroundActive()) {
		const fakeProfile = getOrCreateFakeTabProfile();
		return {
			profileId: fakeProfile.id,
			username: fakeProfile.username,
			avatarUrl: fakeProfile.avatarUrl
		};
	}
	const profile = getProfile?.();
	return {
		profileId: profile?.id,
		username: profile?.username,
		avatarUrl: profile?.avatarUrl
	};
}
function createDevDelegate(serverUrl, getProfile) {
	return new WsMultiplayerApi({
		serverUrl,
		getJoinTicket: async (req) => {
			const { profileId, username, avatarUrl } = resolveDevIdentity(getProfile);
			const body = {
				...req,
				gameId: "dev-game",
				profileId,
				username,
				avatarUrl
			};
			const resp = await fetch(`${serverUrl}/tickets`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body)
			});
			if (!resp.ok) {
				const err = await resp.json().catch(() => ({ error: "Ticket request failed" }));
				throw new Error(err.error || "Ticket request failed");
			}
			return (await resp.json()).ticketId;
		},
		listUserRooms: async (_options) => {
			const { profileId } = resolveDevIdentity(getProfile);
			const url = profileId ? `${serverUrl}/rooms?profileId=${encodeURIComponent(profileId)}` : `${serverUrl}/rooms`;
			const resp = await fetch(url);
			if (!resp.ok) throw new Error("Failed to list rooms");
			return (await resp.json()).rooms;
		}
	});
}
var MockMultiplayerApi = class {
	delegate = null;
	/** Rooms created through the offline mock, returned by getUserRooms. */
	mockRooms = [];
	constructor(options) {
		const devServerUrl = readDevServerUrl();
		if (devServerUrl) this.delegate = createDevDelegate(devServerUrl, options?.getProfile);
	}
	async createRoom(roomType, opts) {
		validateRoomOptions(opts);
		if (this.delegate) return this.delegate.createRoom(roomType, opts);
		console.warn("[RUN] Multiplayer running in offline mock mode — rooms will not connect.\nTo enable local multiplayer, add rundotMultiplayerPlugin() to your Vite config.");
		const ws = new ServerWebSocket({
			url: "ws://localhost:0/mock",
			maxReconnectAttempts: 0
		});
		const roomCode = Math.random().toString(36).slice(2, 8).toUpperCase();
		const playerId = `mock-player-${Math.random().toString(36).slice(2, 8)}`;
		const maxPlayers = opts?.createOptions?.maxPlayers ?? 10;
		const room = new RundotServerRoom({
			type: "room:joined",
			roomCode,
			playerId,
			_roomId: roomCode,
			maxPlayers,
			isCreator: true
		}, ws);
		const now = Date.now();
		this.mockRooms.push({
			roomId: `mock-${roomCode}`,
			roomCode,
			roomType,
			appId: "mock-app",
			players: [playerId],
			maxPlayers,
			isPrivate: false,
			status: "active",
			createdAt: now,
			updatedAt: now
		});
		return room;
	}
	async joinRoomByCode(code) {
		if (this.delegate) return this.delegate.joinRoomByCode(code);
		return this.createRoom(`mock-join-${code}`);
	}
	async joinOrCreateRoom(roomType, opts) {
		if (this.delegate) return this.delegate.joinOrCreateRoom(roomType, opts);
		return this.createRoom(roomType, opts);
	}
	async matchmakeRoom(roomType, opts) {
		if (this.delegate) return this.delegate.matchmakeRoom(roomType, opts);
		return this.createRoom(roomType, opts);
	}
	async getUserRooms(options) {
		if (this.delegate) return this.delegate.getUserRooms(options);
		let rooms = this.mockRooms;
		if (!options?.includeDisposed) rooms = rooms.filter((r) => r.status === "active");
		if (options?.appId) rooms = rooms.filter((r) => r.appId === options.appId);
		return [...rooms];
	}
};
//#endregion
//#region src/video/MockVideoApi.ts
const TAG$1 = "Mock Video";
var MockVideoApi = class {
	async requestPiPAsync(input) {
		mockLog(TAG$1, `requestPiPAsync contentId=${input.contentId}`);
		return { sessionId: "mock-session-id" };
	}
	async readyForPlaybackResumeAsync(input) {}
	async resumeAckAsync(input) {}
	onResumeFromNativePlayback(callback) {
		return { unsubscribe: () => {} };
	}
};
//#endregion
//#region src/activity/ActivityApi.ts
const MEDIA_PLAYBACK_ACTIONS = ["play", "pause"];
function isMediaPlaybackAction(value) {
	return typeof value === "string" && MEDIA_PLAYBACK_ACTIONS.includes(value);
}
function isActivityActionEvent(value) {
	if (typeof value !== "object" || value === null) return false;
	const candidate = value;
	if (typeof candidate.activityId !== "string") return false;
	if (candidate.activityId.trim().length === 0) return false;
	return isMediaPlaybackAction(candidate.action);
}
//#endregion
//#region src/activity/MockActivityApi.ts
const TAG = "Mock Activity";
var MockActivityApi = class {
	active = /* @__PURE__ */ new Map();
	listeners = /* @__PURE__ */ new Set();
	supported;
	constructor(options = {}) {
		this.supported = options.supported ?? true;
	}
	async startActivityAsync(intent) {
		const activityId = `mock-activity:${intent.key}`;
		if (!this.supported) {
			mockLog(TAG, `startActivityAsync skipped key=${intent.key} (no eligible surface)`);
			return {
				activityId,
				status: "skipped",
				reason: "unsupported_surface"
			};
		}
		this.active.set(activityId, intent);
		mockLog(TAG, `startActivityAsync key=${intent.key} activityId=${activityId}`);
		return {
			activityId,
			status: "accepted"
		};
	}
	updateActivity(input) {
		const intent = this.active.get(input.activityId);
		if (!intent) return;
		this.active.set(input.activityId, {
			...intent,
			state: input.state
		});
		mockLog(TAG, `updateActivity activityId=${input.activityId} status=${input.state.status}`);
	}
	async endActivityAsync(input) {
		this.active.delete(input.activityId);
		mockLog(TAG, `endActivityAsync activityId=${input.activityId}`);
	}
	onActivityAction(callback) {
		this.listeners.add(callback);
		return { unsubscribe: () => this.listeners.delete(callback) };
	}
	/** Test/playground affordance: pretend a native surface issued an action. */
	simulateActivityAction(event) {
		if (!isActivityActionEvent(event)) return;
		if (!this.active.has(event.activityId)) return;
		for (const listener of [...this.listeners]) listener(event);
	}
};
//#endregion
//#region src/app/adminGen.ts
function createRpcAdminGenApi(rpcClient, messageIds) {
	return {
		async browse(params) {
			return rpcClient.call(messageIds.browse, params ?? {});
		},
		async removeEntry(generationId) {
			await rpcClient.call(messageIds.removeEntry, { generationId });
		},
		async listReports(params) {
			return rpcClient.call(messageIds.listReports, params ?? {});
		},
		async resolveReport(reportId, action) {
			await rpcClient.call(messageIds.resolveReport, {
				reportId,
				action
			});
		}
	};
}
function createMockAdminGenApi(label) {
	return {
		async browse() {
			console.warn(`[RUN:mock] ${label}.browse() returning empty results`);
			return { entries: [] };
		},
		async removeEntry() {
			console.warn(`[RUN:mock] ${label}.removeEntry() is a no-op in mock mode`);
		},
		async listReports() {
			console.warn(`[RUN:mock] ${label}.listReports() returning empty results`);
			return { reports: [] };
		},
		async resolveReport() {
			console.warn(`[RUN:mock] ${label}.resolveReport() is a no-op in mock mode`);
		}
	};
}
//#endregion
//#region src/app/MockAdminUgcApi.ts
var MockAdminUgcApi = class {
	async browse(_params) {
		console.warn("[RUN:mock] adminUgc.browse() returning empty results");
		return { entries: [] };
	}
	async removeEntry(_entryId) {
		console.warn("[RUN:mock] adminUgc.removeEntry() is a no-op in mock mode");
	}
	async listReports(_params) {
		console.warn("[RUN:mock] adminUgc.listReports() returning empty results");
		return { reports: [] };
	}
	async resolveReport(_reportId, _action) {
		console.warn("[RUN:mock] adminUgc.resolveReport() is a no-op in mock mode");
	}
};
//#endregion
//#region src/app/MockAppApi.ts
/** Shared sample changelog used by the mock + playground app hosts. */
const MOCK_RELEASE_NOTES = [{
	versionNumber: "1.2.0",
	changelog: "# Major Update\n- New ranked ladder\n- Smarter matchmaking\n- Stability fixes",
	releaseType: "major",
	publishedAt: (/* @__PURE__ */ new Date()).toISOString()
}, {
	versionNumber: "1.1.0",
	changelog: "## Update\n- Balance tweaks\n- Bug fixes",
	releaseType: "minor",
	publishedAt: (/* @__PURE__ */ new Date(Date.now() - 6048e5)).toISOString()
}];
var MockAppApi = class {
	rundotGameApi;
	adminUgc;
	adminImageGen;
	adminVideoGen;
	adminSpriteGen;
	adminAudioGen;
	adminThreeDGen;
	constructor(rundotGameApi) {
		this.rundotGameApi = rundotGameApi;
		this.adminUgc = new MockAdminUgcApi();
		this.adminImageGen = createMockAdminGenApi("adminImageGen");
		this.adminVideoGen = createMockAdminGenApi("adminVideoGen");
		this.adminSpriteGen = createMockAdminGenApi("adminSpriteGen");
		this.adminAudioGen = createMockAdminGenApi("adminAudioGen");
		this.adminThreeDGen = createMockAdminGenApi("adminThreeDGen");
	}
	async getMyRole() {
		const mockRole = this.rundotGameApi._mock?.app?.role;
		if (mockRole === "owner" || mockRole === "editor" || mockRole === "none") {
			console.warn(`[RUN:mock] app.getMyRole() returning mock role: '${mockRole}'`);
			return mockRole;
		}
		console.warn("[RUN:mock] app.getMyRole() returning 'none'. Set _mock.app.role to 'owner', 'editor', or 'none' to control.");
		return "none";
	}
	async resolveLaunchIntent(_options) {
		const mockIntent = this.rundotGameApi._mock?.app?.launchIntent;
		if (mockIntent) {
			console.warn(`[RUN:mock] app.resolveLaunchIntent() returning mock intent: '${mockIntent.kind}'`);
			return mockIntent;
		}
		return {
			kind: "none",
			params: {}
		};
	}
	async getReleaseNotesAsync() {
		mockLog("Mock App", "getReleaseNotesAsync");
		return MOCK_RELEASE_NOTES;
	}
	async openReleaseNotesAsync() {
		mockLog("Mock App", "openReleaseNotesAsync (no-op in mock host)");
	}
};
//#endregion
//#region src/attribution/MockAttributionApi.ts
var MockAttributionApi = class {
	async getAttributionParams() {
		return {
			utm_source: "mock_source",
			utm_medium: "mock_medium",
			utm_campaign: "mock_campaign",
			utm_content: null,
			utm_term: null,
			fbclid: null,
			gclid: null
		};
	}
};
//#endregion
//#region src/playable/MockPlayableApi.ts
var MockPlayableApi = class {
	rundotGameApi;
	preSaveHooks = /* @__PURE__ */ new Set();
	_isPlayableMock = false;
	constructor(rundotGameApi) {
		this.rundotGameApi = rundotGameApi;
	}
	setPlayableMock(value) {
		this._isPlayableMock = value;
	}
	isPlayable() {
		const env = this.rundotGameApi._environmentData;
		if (env?.executionMode === "playable" || env?.capabilities?.cta === true) return true;
		return this._isPlayableMock;
	}
	async cta(options) {
		console.info("[RUN:mock] Playable CTA triggered:", options);
		return { completed: true };
	}
	async complete(outcome) {
		console.info("[RUN:mock] Playable complete triggered:", outcome);
	}
	milestone(name, params) {
		console.info(`[RUN:mock] Playable milestone "${name}":`, params);
	}
	onPreSave(hook) {
		this.preSaveHooks.add(hook);
		return () => {
			this.preSaveHooks.delete(hook);
		};
	}
	/** Helper for tests to simulate pre-save flush */
	async triggerPreSaveAsync() {
		for (const hook of this.preSaveHooks) await hook();
	}
};
//#endregion
//#region src/clips/ClipsApi.ts
/** Canonical UGC contentType for recorded gameplay clips — the de-facto "clips collection". */
const CLIP_CONTENT_TYPE = "clip";
//#endregion
//#region src/clips/clipRecorderUtils.ts
/** Ordered by preference. mp4 first (Safari/iOS WebView), webm fallback (Chrome/Android). */
const PREFERRED_MIME_TYPES = [
	"video/mp4;codecs=h264,aac",
	"video/mp4",
	"video/webm;codecs=vp9,opus",
	"video/webm;codecs=vp8,opus",
	"video/webm"
];
function selectMimeType(override) {
	const MR = globalThis.MediaRecorder;
	if (!MR || typeof MR.isTypeSupported !== "function") throw new Error("[clips] MediaRecorder is not available in this environment");
	if (override) {
		if (!MR.isTypeSupported(override)) throw new Error(`[clips] mimeType "${override}" is not supported here`);
		return override;
	}
	for (const type of PREFERRED_MIME_TYPES) if (MR.isTypeSupported(type)) return type;
	throw new Error("[clips] no supported MediaRecorder mime type found");
}
/** Both knobs default ON ("game audio + mic"); gameAudio is only effective if a node is registered. */
function normalizeAudio(audio) {
	return {
		microphone: audio?.microphone ?? true,
		gameAudio: audio?.gameAudio ?? true
	};
}
function resolveCanvas(target) {
	if (target instanceof HTMLCanvasElement) return target;
	const selector = target ?? "canvas";
	const el = document.querySelector(selector);
	if (!(el instanceof HTMLCanvasElement)) throw new Error(`[clips] no <canvas> found for "${selector}"; pass options.canvas explicitly`);
	return el;
}
function isRecordingSupported() {
	const g = globalThis;
	return typeof g.MediaRecorder !== "undefined" && typeof g.HTMLCanvasElement?.prototype?.captureStream === "function";
}
function isMicrophoneSupported() {
	return typeof navigator !== "undefined" && typeof navigator.mediaDevices?.getUserMedia === "function";
}
function isCameraSupported() {
	return typeof navigator !== "undefined" && typeof navigator.mediaDevices?.getUserMedia === "function" && typeof HTMLVideoElement !== "undefined";
}
/**
* Query whether the browser/device already has a given media permission.
* Uses the Permissions API (Chrome/Firefox). Safari and most WebViews do not
* support querying 'microphone'/'camera', so the fallback returns 'granted'
* which triggers the platform consent dialog — a harmless double-prompt on
* first use is preferable to silently skipping consent.
*
* TODO: Eliminate the Safari/iOS double-prompt by adding a host RPC that
* queries native permission state (expo-permissions on RN, Permissions API
* on web) and returning the result to the SDK.
*/
async function queryDevicePermission(name) {
	try {
		const perms = navigator.permissions;
		if (!perms?.query) return "granted";
		const result = await perms.query({ name });
		if (result.state === "granted" || result.state === "denied" || result.state === "prompt") return result.state;
		return "granted";
	} catch {
		return "granted";
	}
}
const DEFAULT_PIP = {
	position: "top-center",
	widthFraction: .25,
	margin: 16,
	borderRadius: 12,
	mirror: true
};
function normalizeCamera(camera) {
	if (!camera) return {
		enabled: false,
		facingMode: "user",
		pip: DEFAULT_PIP
	};
	const opts = camera === true ? {} : camera;
	const facingMode = opts.facingMode ?? "user";
	return {
		enabled: true,
		facingMode,
		pip: {
			...DEFAULT_PIP,
			mirror: facingMode === "user",
			position: opts.pip?.position ?? DEFAULT_PIP.position,
			widthFraction: opts.pip?.widthFraction ?? DEFAULT_PIP.widthFraction
		}
	};
}
//#endregion
//#region src/clips/ClipRecorder.ts
const DEFAULT_FPS = 30;
const DEFAULT_MAX_DURATION_MS = 6e4;
const DEFAULT_BITRATE = 25e5;
function pipXY(position, containerW, containerH, pipW, pipH, margin) {
	switch (position) {
		case "top-left": return {
			x: margin,
			y: margin
		};
		case "top-center": return {
			x: (containerW - pipW) / 2,
			y: margin
		};
		case "top-right": return {
			x: containerW - pipW - margin,
			y: margin
		};
		case "bottom-left": return {
			x: margin,
			y: containerH - pipH - margin
		};
		case "bottom-center": return {
			x: (containerW - pipW) / 2,
			y: containerH - pipH - margin
		};
		case "bottom-right": return {
			x: containerW - pipW - margin,
			y: containerH - pipH - margin
		};
		default: return {
			x: (containerW - pipW) / 2,
			y: margin
		};
	}
}
var ClipRecorder = class {
	active = null;
	gameAudioNode = null;
	isRecording() {
		return this.active !== null;
	}
	useGameAudio(node) {
		this.gameAudioNode = node;
	}
	async start(options = {}) {
		if (this.active) throw new Error("[clips] a recording is already in progress");
		if (!isRecordingSupported()) throw new Error("[clips] recording is not supported in this environment");
		const canvas = resolveCanvas(options.canvas);
		const fps = options.fps ?? DEFAULT_FPS;
		const audio = normalizeAudio(options.audio);
		const useGameAudio = audio.gameAudio && this.gameAudioNode !== null;
		const width = canvas.width;
		const height = canvas.height;
		const manualMode = options.captureMode === "manual";
		const mimeType = selectMimeType(options.mimeType);
		const camera = normalizeCamera(options.camera);
		const tracksToStop = [];
		let audioCleanup = null;
		let previewOverlay = null;
		try {
			let micStream;
			let webcamVideo = null;
			if (camera.enabled) try {
				const constraints = {
					video: {
						facingMode: camera.facingMode,
						width: { ideal: 640 },
						height: { ideal: 480 }
					},
					audio: audio.microphone
				};
				const camStream = await navigator.mediaDevices.getUserMedia(constraints);
				const camVideoTracks = camStream.getVideoTracks();
				const camAudioTracks = camStream.getAudioTracks();
				try {
					webcamVideo = document.createElement("video");
					webcamVideo.srcObject = new MediaStream(camVideoTracks);
					webcamVideo.playsInline = true;
					webcamVideo.muted = true;
					await webcamVideo.play();
				} catch (playErr) {
					camVideoTracks.forEach((t) => t.stop());
					camAudioTracks.forEach((t) => t.stop());
					throw new Error("webcam-setup-failed");
				}
				camVideoTracks.forEach((t) => tracksToStop.push(t));
				if (audio.microphone) {
					micStream = new MediaStream(camAudioTracks);
					micStream.getTracks().forEach((t) => tracksToStop.push(t));
				} else camAudioTracks.forEach((t) => t.stop());
			} catch (camErr) {
				options.onCameraUnavailable?.();
				webcamVideo = null;
			}
			if (audio.microphone && !micStream) {
				micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
				micStream.getTracks().forEach((t) => tracksToStop.push(t));
			}
			const needsComposite = manualMode || webcamVideo !== null;
			let recordStream;
			let manual = null;
			if (needsComposite) {
				const composite = document.createElement("canvas");
				composite.width = width;
				composite.height = height;
				const ctx = composite.getContext("2d");
				if (!ctx) throw new Error("[clips] failed to get 2D context for compositing");
				recordStream = composite.captureStream(fps);
				recordStream.getTracks().forEach((t) => tracksToStop.push(t));
				manual = {
					ctx,
					gameCanvas: canvas,
					width,
					height
				};
			} else {
				recordStream = canvas.captureStream(fps);
				recordStream.getTracks().forEach((t) => tracksToStop.push(t));
			}
			audioCleanup = this.attachAudio(recordStream, micStream, useGameAudio, tracksToStop);
			const recorder = new MediaRecorder(recordStream, {
				mimeType,
				videoBitsPerSecond: options.videoBitsPerSecond ?? DEFAULT_BITRATE
			});
			const chunks = [];
			recorder.ondataavailable = (e) => {
				if (e.data && e.data.size > 0) chunks.push(e.data);
			};
			previewOverlay = webcamVideo ? this.createPreviewOverlay(webcamVideo, canvas, camera) : null;
			this.active = {
				recorder,
				chunks,
				mimeType,
				width,
				height,
				startedAt: Date.now(),
				maxDurationMs: options.maxDurationMs ?? DEFAULT_MAX_DURATION_MS,
				tracksToStop,
				audioCleanup,
				manual,
				webcamVideo,
				camera,
				capped: false,
				stopPromise: null,
				onAutoStop: options.onAutoStop,
				released: false,
				previewOverlay
			};
			if (webcamVideo && !manualMode) this.startCompositeLoop();
			this.startMaxDurationWatcher();
			recorder.start();
		} catch (err) {
			this.active = null;
			audioCleanup?.();
			tracksToStop.forEach((t) => t.stop());
			if (previewOverlay) {
				previewOverlay.srcObject = null;
				previewOverlay.remove();
			}
			throw err;
		}
	}
	/** Adds one mixed audio track (game + mic) or a single source track to recordStream. */
	attachAudio(recordStream, micStream, useGameAudio, tracksToStop) {
		const micTracks = micStream?.getAudioTracks() ?? [];
		const gameNode = useGameAudio ? this.gameAudioNode : null;
		if (!gameNode && micTracks.length === 0) return null;
		if (!gameNode) {
			micTracks.forEach((t) => recordStream.addTrack(t));
			return null;
		}
		const ctx = gameNode.context;
		const dest = ctx.createMediaStreamDestination();
		gameNode.connect(dest);
		let micSource = null;
		if (micTracks.length > 0) {
			micSource = ctx.createMediaStreamSource(new MediaStream(micTracks));
			micSource.connect(dest);
		}
		dest.stream.getAudioTracks().forEach((t) => {
			recordStream.addTrack(t);
			tracksToStop.push(t);
		});
		return () => {
			try {
				gameNode.disconnect(dest);
			} catch {}
			if (micSource) try {
				micSource.disconnect();
			} catch {}
		};
	}
	/** captureMode 'manual': snapshot the game canvas into the recording surface. */
	captureFrame() {
		const a = this.active;
		const m = a?.manual;
		if (!m) return;
		m.ctx.drawImage(m.gameCanvas, 0, 0, m.width, m.height);
		if (a.webcamVideo) this.drawPip(m.ctx, a.webcamVideo, m.width, m.height, a.camera.pip);
	}
	async stop() {
		const active = this.active;
		if (!active) throw new Error("[clips] no active recording to stop");
		if (active.capped) await active.stopPromise;
		else {
			await new Promise((resolve) => {
				if (active.recorder.state === "inactive") {
					resolve();
					return;
				}
				active.recorder.onstop = () => resolve();
				active.recorder.stop();
			});
			this.release(active);
		}
		const blob = new Blob(active.chunks, { type: active.mimeType });
		const durationMs = active.capped ? active.maxDurationMs : Date.now() - active.startedAt;
		this.active = null;
		return {
			blob,
			mimeType: active.mimeType,
			durationMs,
			width: active.width,
			height: active.height,
			sizeBytes: blob.size
		};
	}
	cancel() {
		const active = this.active;
		if (!active) return;
		try {
			active.recorder.ondataavailable = null;
			if (active.recorder.state !== "inactive") active.recorder.stop();
		} finally {
			this.release(active);
			this.active = null;
		}
	}
	/** Ends capture (stops recorder + releases mic/audio) but RETAINS chunks for stop(). */
	cap() {
		const active = this.active;
		if (!active || active.capped) return;
		active.capped = true;
		active.stopPromise = new Promise((resolve) => {
			if (active.recorder.state === "inactive") {
				this.release(active);
				resolve();
				return;
			}
			active.recorder.onstop = () => {
				this.release(active);
				resolve();
			};
			active.recorder.stop();
		});
		active.onAutoStop?.();
	}
	startMaxDurationWatcher() {
		const raf = globalThis.requestAnimationFrame?.bind(globalThis) ?? ((cb) => setTimeout(() => cb(Date.now()), 16));
		const tick = () => {
			const a = this.active;
			if (!a || a.capped) return;
			if (Date.now() - a.startedAt >= a.maxDurationMs) {
				this.cap();
				return;
			}
			raf(tick);
		};
		raf(tick);
	}
	/** Auto-mode composite loop: draws game canvas + PiP each frame. */
	startCompositeLoop() {
		const raf = globalThis.requestAnimationFrame?.bind(globalThis) ?? ((cb) => setTimeout(() => cb(Date.now()), 16));
		const tick = () => {
			const a = this.active;
			if (!a || a.capped || !a.manual || !a.webcamVideo) return;
			a.manual.ctx.drawImage(a.manual.gameCanvas, 0, 0, a.manual.width, a.manual.height);
			this.drawPip(a.manual.ctx, a.webcamVideo, a.manual.width, a.manual.height, a.camera.pip);
			raf(tick);
		};
		raf(tick);
	}
	drawPip(ctx, video, canvasWidth, canvasHeight, pip) {
		if (video.videoWidth === 0 || video.videoHeight === 0) return;
		const pipW = Math.round(canvasWidth * pip.widthFraction);
		const pipH = Math.round(pipW * (video.videoHeight / Math.max(1, video.videoWidth)));
		const m = pip.margin;
		const { x, y } = pipXY(pip.position, canvasWidth, canvasHeight, pipW, pipH, m);
		ctx.save();
		this.drawRoundRect(ctx, x, y, pipW, pipH, pip.borderRadius);
		ctx.clip();
		if (pip.mirror) {
			ctx.translate(x + pipW, y);
			ctx.scale(-1, 1);
			ctx.drawImage(video, 0, 0, pipW, pipH);
		} else ctx.drawImage(video, x, y, pipW, pipH);
		ctx.restore();
	}
	drawRoundRect(ctx, x, y, w, h, r) {
		const radius = Math.min(r, w / 2, h / 2);
		ctx.beginPath();
		ctx.moveTo(x + radius, y);
		ctx.arcTo(x + w, y, x + w, y + h, radius);
		ctx.arcTo(x + w, y + h, x, y + h, radius);
		ctx.arcTo(x, y + h, x, y, radius);
		ctx.arcTo(x, y, x + w, y, radius);
		ctx.closePath();
	}
	/**
	* Creates a fixed-position live camera preview visible at the top of the viewport.
	* Appended to document.body so no app element can hide or re-layer it.
	*/
	createPreviewOverlay(webcamVideo, _gameCanvas, camera) {
		const preview = document.createElement("video");
		preview.srcObject = webcamVideo.srcObject;
		preview.playsInline = true;
		preview.muted = true;
		preview.autoplay = true;
		const pip = camera.pip;
		const marginPx = `${pip.margin}px`;
		const s = preview.style;
		s.position = "fixed";
		s.width = `${Math.round(pip.widthFraction * 100)}vw`;
		s.height = "auto";
		s.borderRadius = `${pip.borderRadius}px`;
		s.objectFit = "cover";
		s.pointerEvents = "none";
		s.zIndex = "2147483647";
		const transforms = [];
		switch (pip.position) {
			case "top-left":
				s.top = marginPx;
				s.left = marginPx;
				break;
			case "top-center":
				s.top = marginPx;
				s.left = "50%";
				transforms.push("translateX(-50%)");
				break;
			case "top-right":
				s.top = marginPx;
				s.right = marginPx;
				break;
			case "bottom-left":
				s.bottom = marginPx;
				s.left = marginPx;
				break;
			case "bottom-center":
				s.bottom = marginPx;
				s.left = "50%";
				transforms.push("translateX(-50%)");
				break;
			case "bottom-right":
				s.bottom = marginPx;
				s.right = marginPx;
		}
		if (pip.mirror) transforms.push("scaleX(-1)");
		if (transforms.length > 0) s.transform = transforms.join(" ");
		document.body.appendChild(preview);
		preview.play().catch(() => {});
		return preview;
	}
	/** Idempotent: stops mic/canvas/webcam tracks, disconnects audio nodes, removes overlay. */
	release(active) {
		if (active.released) return;
		active.released = true;
		active.audioCleanup?.();
		active.tracksToStop.forEach((t) => t.stop());
		if (active.previewOverlay) {
			active.previewOverlay.srcObject = null;
			active.previewOverlay.remove();
			active.previewOverlay = null;
		}
		if (active.webcamVideo) {
			active.webcamVideo.srcObject = null;
			active.webcamVideo = null;
		}
	}
};
//#endregion
//#region src/clips/ClipsApiImpl.ts
function extensionForMime(mimeType) {
	return mimeType.includes("mp4") ? "mp4" : "webm";
}
var ClipsApiImpl = class {
	deps;
	recorder;
	constructor(deps, recorderFactory = () => new ClipRecorder()) {
		this.deps = deps;
		this.recorder = recorderFactory();
	}
	async isSupportedAsync() {
		const canRecord = isRecordingSupported();
		return {
			canRecord,
			canUseMicrophone: canRecord && isMicrophoneSupported(),
			canUseCamera: canRecord && isCameraSupported(),
			reason: canRecord ? void 0 : "MediaRecorder/captureStream unavailable"
		};
	}
	getCaptureConsentAsync() {
		return this.deps.captureConsent.get();
	}
	async requestCaptureConsentAsync(opts) {
		const existing = await this.deps.captureConsent.get();
		if (existing.status === "granted") return existing;
		if (existing.status === "denied") return existing;
		if (await queryDevicePermission(opts?.includesCamera ? "camera" : "microphone") === "prompt") return {
			status: "granted",
			canAskAgain: true
		};
		return this.deps.captureConsent.request({ includesCamera: opts?.includesCamera });
	}
	useGameAudio(node) {
		this.recorder.useGameAudio(node);
	}
	captureFrame() {
		this.recorder.captureFrame();
	}
	async cancelRecordingAsync() {
		this.recorder.cancel();
	}
	async startRecordingAsync(options) {
		const audio = normalizeAudio(options?.audio);
		const camera = normalizeCamera(options?.camera);
		if (audio.microphone || camera.enabled) await this.ensureCaptureConsent({ includesCamera: camera.enabled });
		await this.recorder.start(options);
	}
	/**
	* Throws CAPTURE_CONSENT_DENIED if consent is denied or the platform dialog
	* is declined. Otherwise resolves and recording may proceed.
	*
	* Logic:
	* - T1 / already granted (get() returns granted) → proceed
	* - Already denied → throw
	* - Device permission is 'prompt' → skip platform dialog; the browser/OS shows
	*   its own prompt during getUserMedia (single opt-in). The host cannot
	*   securely self-grant from a game signal, so app consent stays
	*   'undetermined' and the platform dialog shows on the next recording.
	* - Device permission is 'denied' → skip, let getUserMedia fail naturally
	* - Device permission is 'granted' → show the platform dialog (no system
	*   dialog is coming, so this is the user's single opt-in)
	*/
	async ensureCaptureConsent(opts) {
		const consent = await this.deps.captureConsent.get();
		if (consent.status === "granted") return;
		if (consent.status === "denied") throw new Error("CAPTURE_CONSENT_DENIED");
		const deviceState = await queryDevicePermission(opts?.includesCamera ? "camera" : "microphone");
		if (deviceState === "prompt" || deviceState === "denied") return;
		if ((await this.deps.captureConsent.request({ includesCamera: opts?.includesCamera })).status !== "granted") throw new Error("CAPTURE_CONSENT_DENIED");
	}
	async stopRecordingAsync(persist) {
		const clip = await this.recorder.stop();
		if ((persist?.persist ?? "ugc") === "none") return { ...clip };
		const quota = await this.deps.files.getQuota();
		if (clip.sizeBytes > quota.maxFileBytes) throw new Error(`[clips] clip is ${clip.sizeBytes} bytes which exceeds the ${quota.maxFileBytes}-byte upload cap; lower maxDurationMs, fps, or videoBitsPerSecond`);
		const key = `clips/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${extensionForMime(clip.mimeType)}`;
		const upload = await this.deps.files.upload({
			key,
			contentType: clip.mimeType,
			sizeBytes: clip.sizeBytes,
			visibility: "private"
		});
		let fileEntry;
		try {
			const putResponse = await fetch(upload.uploadUrl, {
				method: "PUT",
				headers: upload.uploadHeaders,
				body: clip.blob
			});
			if (!putResponse.ok) throw new Error(`[clips] upload PUT failed with status ${putResponse.status}`);
			fileEntry = await this.deps.files.confirmUpload(upload.key);
		} catch (err) {
			await this.deps.files.delete(upload.key).catch(() => void 0);
			throw err;
		}
		const data = {
			...persist?.data,
			fileKey: upload.key,
			durationMs: clip.durationMs,
			width: clip.width,
			height: clip.height,
			mimeType: clip.mimeType,
			codec: fileEntry.mediaMetadata?.codec
		};
		let entry;
		try {
			entry = await this.deps.ugc.create({
				contentType: CLIP_CONTENT_TYPE,
				data,
				isPublic: false,
				title: persist?.title,
				tags: persist?.tags
			});
		} catch (err) {
			await this.deps.files.delete(upload.key).catch(() => void 0);
			throw err;
		}
		return {
			...clip,
			ugc: entry,
			fileKey: upload.key,
			fileUrl: fileEntry.url
		};
	}
	async publishClipAsync(ugcId) {
		const entry = await this.deps.ugc.get(ugcId);
		if (!entry) throw new Error(`[clips] UGC entry "${ugcId}" not found`);
		const fileKey = entry.data?.fileKey;
		if (typeof fileKey !== "string" || fileKey.length === 0) throw new Error(`[clips] UGC entry "${ugcId}" has no data.fileKey; refusing to publish a clip with no accessible file`);
		await this.deps.files.setVisibility(fileKey, "public");
		try {
			return await this.deps.ugc.update({
				id: ugcId,
				isPublic: true
			});
		} catch (err) {
			await this.deps.files.setVisibility(fileKey, "private").catch(() => void 0);
			throw err;
		}
	}
};
//#endregion
export { RundotGameRoom as $, validateShareIntentParams as A, MockEnvironmentApi as At, SOCIAL_COMPOSE_PLATFORMS as B, toPromptWireRequest as Bt, AccessDeniedError as C, fnv1a32 as Ct, validateClickMetadata as D, applySafeAreaUpdate as Dt, stripComposeControlChars as E, applySafeAreaCssVariables as Et, COMPOSE_POST_MAX_TITLE_LENGTH as F, MockAnalyticsApi as Ft, MockTimeApi as G, MockPreloaderApi as H, MockDebug as Ht, COMPOSE_POST_SUBREDDIT_PATTERN as I, MockAssetLibraryApi as It, createMemoryKeyValueStore as J, isPacificDaylightTime as K, FOLLOW_ME_PLATFORMS as L, DEFAULT_ASSET_LIBRARY_BASE_URL as Lt, validateShareParams as M, MockCdnApi as Mt, validateShareTarget as N, BaseCdnApi as Nt, validateComposePost as O, sanitizeSafeArea as Ot, COMPOSE_POST_MAX_TEXT_LENGTH as P, MockAvatarApi as Pt, ROOM_GAME_PHASES as Q, SHARE_FILE_ALLOWED_MIME_TYPES as R, defaultPackBaseUrl as Rt, createAccessGatedApi as S, assignmentBucket as St, buildXComposerUrl as T, MockFeaturesApi as Tt, MockCollectiblesApi as U, mockLog as Ut, checkText as V, MockAdsApi as Vt, MockStatsApi as W, RundotGameMessageId as Wt, ValidatingStorageApi as X, createMockStorageApi as Y, initializeRoomsApi as Z, MockAccessGateApi as _, MockHapticsApi as _t, MockAttributionApi as a, MockLoggingApi as at, applyAccessGates as b, BUCKET_COUNT as bt, MockAdminUgcApi as c, MockIapApi as ct, MockActivityApi as d, MockGamepadApi as dt, generateId as et, isActivityActionEvent as f, LatencyTracker as ft, WsMultiplayerApi as g, GAMEPAD_BUTTON_NAMES as gt, MockMultiplayerApi as h, normalizeStandardGamepad as ht, MockPlayableApi as i, MockNavigationApi as it, validateShareMetadata as j, MockDeviceApi as jt, validateShareFile as k, MockSystemApi as kt, createMockAdminGenApi as l, TIER_SUPPORTED_INTERVALS as lt, MockVideoApi as m, canReadWebGamepads as mt, ClipRecorder as n, MockPopupsApi as nt, MOCK_RELEASE_NOTES as o, MockLifecycleApi as ot, isMediaPlaybackAction as p, WebGamepadReader as pt, MockStorageApi as q, CLIP_CONTENT_TYPE as r, MockNotificationsApi as rt, MockAppApi as s, MockCreditsApi as st, ClipsApiImpl as t, PlaygroundProfileApi as tt, createRpcAdminGenApi as u, assertTierSupportsInterval as ut, GATED_IMAGE_GEN_METHODS as v, ExposureDeduper as vt, buildRedditComposerUrl as w, resolveLiveOpsSection as wt, gateStreaming as x, assignVariant as xt, GATED_MULTIPLAYER_METHODS as y, LiveOpsCache as yt, SHARE_FILE_MAX_SIZE_BYTES as z, serializeCanvasInState as zt };

//# sourceMappingURL=ClipsApiImpl-mFIIqDe9.js.map