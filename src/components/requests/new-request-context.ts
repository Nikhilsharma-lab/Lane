"use client";

import { createContext } from "react";

export const NewRequestContext = createContext<{
  openComposer: (trigger?: HTMLElement) => void;
  /** Loads the composer's form ahead of a click or C (plan item 2.3). */
  preload: () => void;
} | null>(null);
