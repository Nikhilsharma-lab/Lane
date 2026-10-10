"use client";

import { createContext, useContext, type PointerEventHandler, type ReactNode } from "react";
import { PanelLeft } from "lucide-react";
import { Button } from "@/components/arc/button/button";
import styles from "./workspace-shell.module.css";

type Controls = { collapsed: boolean; peeking: boolean; expand: () => void; onPointerEnter: PointerEventHandler<HTMLButtonElement>; onPointerLeave: PointerEventHandler<HTMLButtonElement> };
const SidebarControls = createContext<Controls | null>(null);

export function SidebarControlsProvider({ children, ...controls }: Controls & { children: ReactNode }) {
  return <SidebarControls value={controls}>{children}</SidebarControls>;
}

/** Appears beside the page title only after the desktop sidebar is collapsed. */
export function SidebarExpandButton() {
  const controls = useContext(SidebarControls);
  if (!controls?.collapsed) return null;
  return <Button variant="ghost" size="sm" className={styles.expand} aria-label="Expand sidebar" aria-expanded={controls.peeking} aria-controls="lane-sidebar" aria-keyshortcuts="[" title="Expand sidebar ([)" onClick={controls.expand} onPointerEnter={controls.onPointerEnter} onPointerLeave={controls.onPointerLeave}><PanelLeft size={17} strokeWidth={1.75} aria-hidden="true" /></Button>;
}
