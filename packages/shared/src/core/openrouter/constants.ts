export const OPENROUTER_API_BASE = "https://openrouter.ai/api/v1";

/**
 * Attribution headers — recommended by OpenRouter so this app shows up in
 * their public model rankings and analytics.
 *
 * https://openrouter.ai/docs/api/api-reference/chat/send-chat-completion-request#headers
 */
export const ATTRIBUTION_REFERRER = "https://github.com/aurokin/routerchat";
export const ATTRIBUTION_TITLE = "RouterChat";

export const WEB_SEARCH_SYSTEM_GUIDANCE =
    "Web search is available for this request. When the user asks to keep searching, verify, retry, or find more sources, run fresh web searches using the conversation context instead of relying only on earlier search snippets. If results are weak, reformulate and search again before concluding data is unavailable.";
