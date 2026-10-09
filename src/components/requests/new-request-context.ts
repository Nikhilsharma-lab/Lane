"use client";

import { createContext } from "react";

export const NewRequestContext = createContext<{
  openComposer: (trigger?: HTMLElement) => void;
} | null>(null);
