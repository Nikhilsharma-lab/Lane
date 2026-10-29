/**
 * Motion presets are shared by the gallery and future registry consumers.
 * Lane adaptation (#262): these are the theme's motion scale (src/styles/theme.css) in seconds, for Motion,
 * which cannot read CSS variables. `pnpm design:check` fails if a duration or ease differs from the theme,
 * or if a spring bounces. Fast 0.15s, standard 0.2s, exits 0.1 to 0.15s; no longer "considered" step.
 */
export const motionTokens = {
  duration: { instant: 0.1, fast: 0.15, exit: 0.15, standard: 0.2 },
  ease: {
    enter: [0.16, 1, 0.3, 1],
    exit: [0.4, 0, 1, 1],
    standard: [0.22, 1, 0.36, 1],
    /** For elements that move while already on screen. */
    inOut: [0.4, 0, 0.2, 1],
  },
  spring: {
    responsive: { type: "spring", visualDuration: 0.15, bounce: 0 },
    gentle: { type: "spring", visualDuration: 0.2, bounce: 0 },
    /** Presses, toggles, thumbs, and small indicators. Settles fast, never overshoots. */
    snappy: { type: "spring", visualDuration: 0.15, bounce: 0 },
    /** Panels, height changes, and layout shifts. Critically damped, never overshoots. */
    smooth: { type: "spring", visualDuration: 0.2, bounce: 0 },
    /** Shape morphs, shared layout highlights, and width changes that follow new content. Never overshoots. */
    morph: { type: "spring", visualDuration: 0.2, bounce: 0 },
  },
  /** Stagger steps in seconds. Keep total stagger under roughly 0.4s. */
  stagger: { char: 0.016, word: 0.04, line: 0.08, item: 0.035 },
  /** Blur radii in px for text and content crossfades. Keep blur small and brief. */
  blur: { subtle: 2, soft: 4, text: 8 },
} as const;
