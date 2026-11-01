/**
 * #266: `motion/react` is framer-motion re-exported, plus `const motion = fm.motion` read off the whole namespace,
 * which keeps all of Motion (every feature) in each page however little a page uses. Resolving it to framer-motion
 * itself (the same installed version: `motion` and `framer-motion` are pinned to one version in package.json, and
 * `motion-setup.test.ts` fails if they drift) lets the bundler keep only what is imported, so LazyMotion's split
 * (motion-features.tsx) works. The build (next.config.ts) and the unit suites (vitest configs) resolve it alike.
 */
export const MOTION_ALIAS = { "motion/react": "framer-motion" } as const;
