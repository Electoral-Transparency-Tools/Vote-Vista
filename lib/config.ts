// App-wide configuration. Edit these to tune behaviour.

/**
 * How long a cached AI insight (candidate summary, top-candidate overview,
 * MLA research report) is reused before it is regenerated. Change this single
 * value to adjust the expiry window for all AI insight features.
 */
export const AI_INSIGHT_TTL_HOURS = 24;

export const AI_INSIGHT_TTL_MS = AI_INSIGHT_TTL_HOURS * 60 * 60 * 1000;

/**
 * Rate limits for AI generation calls (LLM + web search). Only actual
 * generations are counted — cached insights are served for free. Tune these
 * to control cost/abuse.
 */
// Per visitor (IP): max generations within the rolling window.
export const AI_RATELIMIT_PER_IP_MAX = 15;
export const AI_RATELIMIT_PER_IP_WINDOW_MS = 10 * 60 * 1000; // 10 minutes
// Global safety cap across all users per day (bounds total spend).
export const AI_RATELIMIT_GLOBAL_DAILY_MAX = 500;
export const AI_RATELIMIT_GLOBAL_WINDOW_MS = 24 * 60 * 60 * 1000; // 1 day
