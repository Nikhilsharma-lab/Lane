"use client";

import { createContext } from "react";

export const NewRequestContext = createContext<{
  /** `guided` (#217): opened from the first-run guide, so the composer explains each step. */
  openComposer: (trigger?: HTMLElement, options?: { guided?: boolean }) => void;
  /** Loads the composer's form ahead of a click or C (plan item 2.3). */
  preload: () => void;
} | null>(null);
