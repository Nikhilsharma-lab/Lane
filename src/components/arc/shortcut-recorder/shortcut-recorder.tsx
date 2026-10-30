"use client";

import { forwardRef, useEffect, useState, useSyncExternalStore } from "react";
import type { HTMLAttributes, ReactNode } from "react";
import styles from "./shortcut-recorder.module.css";

/* Lane adaptation (#262, polish bar §9): Lane shows fixed shortcuts only, so it keeps Arc's shortcut model,
 * `ShortcutKbd` and `ShortcutKeys`. The recorder field and the searchable list are left out (Arc: "Use
 * ShortcutKbd alone when shortcuts are fixed and only need to be shown"). Lane's key caps go through
 * `src/components/keyboard/key-caps.tsx`, which hides them on touch screens. */

/* ================================================================================================
 * Shortcut model. A shortcut is a string such as "mod+shift+k". `mod` is ⌘ on Apple platforms and
 * Ctrl elsewhere, so one binding reads right everywhere. Keys come from the physical key where it
 * matters, so ⌥K records as "alt+k" instead of "˚".
 * ============================================================================================== */

export type Platform = "mac" | "other";
export interface ShortcutToken { /** What the key cap shows. */ label: string; /** Physical key id, matched against held keys. */ id: string; spoken: string }

const MODIFIER_ORDER = ["mod", "ctrl", "alt", "shift", "meta"] as const;
type Modifier = (typeof MODIFIER_ORDER)[number];
const isModifier = (part: string): part is Modifier => (MODIFIER_ORDER as readonly string[]).includes(part);

const CODE_KEYS: Record<string, string> = {
  Comma: ",", Period: ".", Slash: "/", Semicolon: ";", Quote: "'", BracketLeft: "[", BracketRight: "]", Backslash: "\\", Minus: "-", Equal: "=", Backquote: "`",
  Space: "space", Enter: "enter", NumpadEnter: "enter", Escape: "escape", Backspace: "backspace", Delete: "delete", Tab: "tab",
  ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right", Home: "home", End: "end", PageUp: "pageup", PageDown: "pagedown",
};
const MODIFIER_KEYS: Record<string, string> = { Meta: "meta", OS: "meta", Control: "ctrl", Alt: "alt", AltGraph: "alt", Shift: "shift" };

/** The physical key id for an event: "k", "1", "enter", "meta", "shift"… `null` for keys that never make a shortcut, such as Caps Lock. */
export function keyId(event: Pick<KeyboardEvent, "key" | "code">): string | null {
  const { code, key } = event;
  if (MODIFIER_KEYS[key]) return MODIFIER_KEYS[key];
  if (/^Key[A-Z]$/.test(code)) return code.slice(3).toLowerCase();
  if (/^Digit\d$/.test(code)) return code.slice(5);
  if (/^Numpad\d$/.test(code)) return code.slice(6);
  if (CODE_KEYS[code]) return CODE_KEYS[code];
  if (/^F\d{1,2}$/.test(key)) return key.toLowerCase();
  if (key === "CapsLock" || key === "Fn" || key === "Dead" || key === "Unidentified" || key === "Process") return null;
  return key.length === 1 ? key.toLowerCase() : null;
}

function splitShortcut(shortcut: string) {
  const parts = shortcut.toLowerCase().split("+").map(part => part.trim()).filter(Boolean);
  const key = parts.filter(part => !isModifier(part)).pop() ?? "";
  return { mods: new Set(parts.filter(isModifier)), key };
}

/** One spelling per combination: on a Mac, Command is `mod`; elsewhere, Ctrl is. Modifiers come in a fixed order. */
export function normalizeShortcut(shortcut: string, platform: Platform) {
  const { mods, key } = splitShortcut(shortcut);
  if (platform === "mac" && mods.delete("meta")) mods.add("mod");
  if (platform === "other" && mods.delete("ctrl")) mods.add("mod");
  return [...MODIFIER_ORDER.filter(mod => mods.has(mod)), key].filter(Boolean).join("+");
}

/** Reads a keydown into a shortcut string, or `null` while only modifiers are down. */
export function shortcutFromEvent(event: Pick<KeyboardEvent, "key" | "code" | "metaKey" | "ctrlKey" | "altKey" | "shiftKey">, platform: Platform) {
  const key = keyId(event);
  if (!key || ["meta", "ctrl", "alt", "shift"].includes(key)) return null;
  const mods: string[] = [];
  if (platform === "mac" ? event.metaKey : event.ctrlKey) mods.push("mod");
  if (platform === "mac" ? event.ctrlKey : false) mods.push("ctrl");
  if (event.altKey) mods.push("alt");
  if (event.shiftKey) mods.push("shift");
  if (platform === "other" && event.metaKey) mods.push("meta");
  return normalizeShortcut([...mods, key].join("+"), platform);
}

/** True when a keydown is this shortcut. Use it to run the action a recorded shortcut is bound to. */
export function matchesShortcut(event: Pick<KeyboardEvent, "key" | "code" | "metaKey" | "ctrlKey" | "altKey" | "shiftKey">, shortcut: string, platform: Platform) {
  const pressed = shortcutFromEvent(event, platform);
  return !!pressed && pressed === normalizeShortcut(shortcut, platform);
}

const MAC_KEYS: Record<string, [string, string]> = { enter: ["↩", "Return"], backspace: ["⌫", "Delete"], delete: ["⌦", "Forward delete"], tab: ["⇥", "Tab"], escape: ["esc", "Escape"] };
const SHARED_KEYS: Record<string, [string, string]> = {
  space: ["Space", "Space"], enter: ["Enter", "Enter"], escape: ["Esc", "Escape"], backspace: ["Backspace", "Backspace"], delete: ["Del", "Delete"], tab: ["Tab", "Tab"],
  up: ["↑", "Up arrow"], down: ["↓", "Down arrow"], left: ["←", "Left arrow"], right: ["→", "Right arrow"], home: ["Home", "Home"], end: ["End", "End"], pageup: ["PgUp", "Page up"], pagedown: ["PgDn", "Page down"],
  ",": [",", "Comma"], ".": [".", "Period"], "/": ["/", "Slash"], ";": [";", "Semicolon"], "'": ["'", "Quote"], "[": ["[", "Left bracket"], "]": ["]", "Right bracket"], "\\": ["\\", "Backslash"], "-": ["-", "Minus"], "=": ["=", "Equals"], "`": ["`", "Backtick"],
};

/** Key caps for a shortcut in platform order: ⌃ ⌥ ⇧ ⌘ on a Mac, Ctrl Alt Shift Win elsewhere. */
export function shortcutTokens(shortcut: string, platform: Platform): ShortcutToken[] {
  const { mods, key } = splitShortcut(normalizeShortcut(shortcut, platform));
  const tokens: ShortcutToken[] = [];
  if (platform === "mac") {
    if (mods.has("ctrl")) tokens.push({ label: "⌃", id: "ctrl", spoken: "Control" });
    if (mods.has("alt")) tokens.push({ label: "⌥", id: "alt", spoken: "Option" });
    if (mods.has("shift")) tokens.push({ label: "⇧", id: "shift", spoken: "Shift" });
    if (mods.has("mod") || mods.has("meta")) tokens.push({ label: "⌘", id: "meta", spoken: "Command" });
  } else {
    if (mods.has("mod") || mods.has("ctrl")) tokens.push({ label: "Ctrl", id: "ctrl", spoken: "Control" });
    if (mods.has("alt")) tokens.push({ label: "Alt", id: "alt", spoken: "Alt" });
    if (mods.has("shift")) tokens.push({ label: "Shift", id: "shift", spoken: "Shift" });
    if (mods.has("meta")) tokens.push({ label: "Win", id: "meta", spoken: "Windows" });
  }
  if (key) {
    const named = (platform === "mac" ? MAC_KEYS[key] : undefined) ?? SHARED_KEYS[key];
    tokens.push(named ? { label: named[0], id: key, spoken: named[1] } : { label: key.toUpperCase(), id: key, spoken: key.toUpperCase() });
  }
  return tokens;
}

/** "⌘⇧K" on a Mac, "Ctrl+Shift+K" elsewhere, plus a spoken form for assistive technology. */
export function formatShortcut(shortcut: string, platform: Platform) {
  const tokens = shortcutTokens(shortcut, platform);
  return { text: tokens.map(token => token.label).join(platform === "mac" ? "" : "+"), spoken: tokens.map(token => token.spoken).join(" ") };
}

const subscribe = () => () => {};
const detectPlatform = (): Platform => {
  if (typeof navigator === "undefined") return "mac";
  const hint = (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform ?? navigator.platform ?? navigator.userAgent;
  return /mac|iphone|ipad|ipod/i.test(hint) ? "mac" : "other";
};
/** The viewer's platform. Server renders assume a Mac and settle on the first client render. */
export function usePlatform(override?: Platform): Platform {
  const detected = useSyncExternalStore(subscribe, detectPlatform, () => "mac" as Platform);
  return override ?? detected;
}

/** Keys held down right now, by physical id. Clears on window blur, and after Command lifts (macOS drops the other keyups). */
export function usePressedKeys(enabled = true) {
  const [held, setHeld] = useState<ReadonlySet<string>>(() => new Set());
  useEffect(() => {
    if (!enabled) return;
    const update = (change: (next: Set<string>) => void) => setHeld(current => { const next = new Set(current); change(next); return next.size === current.size && [...next].every(key => current.has(key)) ? current : next; });
    const down = (event: KeyboardEvent) => { const id = keyId(event); if (id) update(next => next.add(id)); };
    const up = (event: KeyboardEvent) => {
      const id = keyId(event);
      update(next => {
        if (id) next.delete(id);
        if (id === "meta") [...next].forEach(key => { if (!["ctrl", "alt", "shift"].includes(key)) next.delete(key); });
        if (!event.metaKey) next.delete("meta"); if (!event.ctrlKey) next.delete("ctrl"); if (!event.altKey) next.delete("alt"); if (!event.shiftKey) next.delete("shift");
      });
    };
    const clear = () => setHeld(current => current.size ? new Set() : current);
    // Capture phase, so keys still register while a focused recorder keeps the chord from bubbling.
    window.addEventListener("keydown", down, true);
    window.addEventListener("keyup", up, true);
    window.addEventListener("blur", clear);
    document.addEventListener("visibilitychange", clear);
    return () => { window.removeEventListener("keydown", down, true); window.removeEventListener("keyup", up, true); window.removeEventListener("blur", clear); document.removeEventListener("visibilitychange", clear); };
  }, [enabled]);
  return enabled ? held : EMPTY;
}
const EMPTY: ReadonlySet<string> = new Set();

/* ================================================================================================
 * ShortcutKbd and ShortcutKeys
 * ============================================================================================== */

export interface ShortcutKbdProps extends HTMLAttributes<HTMLElement> {
  children: ReactNode;
  /** Draws the key pushed down and lit, such as while it is held. */
  pressed?: boolean;
  size?: "sm" | "md";
}

/** A key cap. Use it inline in copy, in menus, or through `ShortcutKeys` for a whole combination. */
export const ShortcutKbd = forwardRef<HTMLElement, ShortcutKbdProps>(function ShortcutKbd({ children, pressed = false, size = "md", className, ...props }, ref) {
  return <kbd ref={ref} {...props} className={[styles.kbd, className].filter(Boolean).join(" ")} data-size={size} data-pressed={pressed || undefined}>{children}</kbd>;
});
ShortcutKbd.displayName = "ShortcutKbd";
/** @deprecated Renamed to `ShortcutKbd` so it never clashes with the `kbd` component's `Kbd` in a shared index.ts. */
export const Kbd = ShortcutKbd;
/** @deprecated Renamed to `ShortcutKbdProps`. */
export type KbdProps = ShortcutKbdProps;

export interface ShortcutKeysProps {
  shortcut: string;
  platform?: Platform;
  /** Held key ids from `usePressedKeys`; matching caps light up. */
  pressed?: ReadonlySet<string>;
  size?: "sm" | "md";
  className?: string;
}

/** A shortcut as key caps, with a spoken label for assistive technology. */
export function ShortcutKeys({ shortcut, platform: platformProp, pressed, size = "md", className }: ShortcutKeysProps) {
  const platform = usePlatform(platformProp);
  const tokens = shortcutTokens(shortcut, platform);
  return <span className={[styles.keys, className].filter(Boolean).join(" ")} role="img" aria-label={tokens.map(token => token.spoken).join(" ")}>
    {tokens.map((token, index) => <ShortcutKbd key={`${index}-${token.id}`} size={size} pressed={pressed?.has(token.id)} aria-hidden="true">{token.label}</ShortcutKbd>)}
  </span>;
}
