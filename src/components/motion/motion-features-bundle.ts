import { domMax } from "motion/react"

/**
 * #266: the Motion features that wait for the page: gestures (press, pan, tap), drag and layout (`layout`,
 * `layoutId`). Loaded by `motion-features.tsx`, never imported directly. Entrances, exits and `animate()` are
 * in the page's own code (domMin), so nothing that appears on the first paint or opens with a popup waits.
 */
export const features = domMax
