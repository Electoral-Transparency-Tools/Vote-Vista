// App-wide configuration. Edit these to tune behaviour.

/**
 * How long a cached AI insight (candidate summary, top-candidate overview,
 * MLA research report) is reused before it is regenerated. Change this single
 * value to adjust the expiry window for all AI insight features.
 */
export const AI_INSIGHT_TTL_HOURS = 24;

export const AI_INSIGHT_TTL_MS = AI_INSIGHT_TTL_HOURS * 60 * 60 * 1000;
