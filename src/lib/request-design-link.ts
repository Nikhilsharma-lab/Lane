/**
 * Design reviews happen in Figma (REQUIREMENTS.md, 2026-10-18). Rounds saved
 * before then stay in `requests.design_reviews`; Lane reads only their design
 * link, as the fallback when the Request has no Figma link of its own.
 */
export type SavedDesignReview = { designUrl: string }
