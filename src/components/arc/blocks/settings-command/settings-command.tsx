"use client";
// Arc Pro source (https://uiarc.dev), adapted from licensed settings-command for Lane.
// Not covered by this repository's license; not for reuse outside Lane.

import { useEffect, useLayoutEffect, useRef } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { LayoutGroup, animate, motion, useMotionValue } from "motion/react";
import { Search, CornerDownLeft } from "lucide-react";
import { motionTokens } from "../../lib/motion-tokens";
import styles from "./settings-command.module.css";
import { KeyCap } from "@/components/keyboard/key-caps";
export type SettingDefinition = { id: string; section: string; group: string; label: string; description: string; keywords?: string[]; soon?: boolean; target?: string };
export type Rect = { x: number; y: number; width: number; height: number };
export type Result = { def: SettingDefinition; score: number; match: [number, number] | null };
export type Closing = { to: Rect; mode: "trigger" | "row" } | null;
const enterEase = [...motionTokens.ease.enter] as [number, number, number, number];
const calm = motionTokens.spring.morph;
function Highlight({ text, match }: { text: string; match: [number, number] | null }) {
  if (!match) return <>{text}</>;
  return <>{text.slice(0, match[0])}<mark className={styles.mark}>{text.slice(match[0], match[1])}</mark>{text.slice(match[1])}</>;
}

export function relativeRect(node: Element, frame: Element): Rect {
  const a = node.getBoundingClientRect(), b = frame.getBoundingClientRect();
  return { x: a.left - b.left, y: a.top - b.top, width: a.width, height: a.height };
}

/** The search field itself grows into the palette: position, size, and corners ride one spring, and the results are revealed by the growing edge rather than reflowing. */
export function SettingsCommandPalette({ uid, origin, frameWidth, closing, onClosed, query, onQuery, results, suggestions, active, onActive, onPick, onClose, reduce }: {
  uid: string; origin: Rect; frameWidth: number; closing: Closing; onClosed: () => void;
  query: string; onQuery: (value: string) => void; results: Result[]; suggestions: Result[]; active: number; onActive: (index: number) => void;
  onPick: (result: Result) => void; onClose: () => void; reduce: boolean;
}) {
  const width = Math.min(560, frameWidth - 24);
  const target = { x: (frameWidth - width) / 2, y: 12, width };
  const x = useMotionValue(reduce ? target.x : origin.x), y = useMotionValue(reduce ? target.y : origin.y);
  const w = useMotionValue(reduce ? target.width : origin.width), h = useMotionValue(origin.height);
  const radius = useMotionValue(reduce ? 14 : 10);
  const shell = useMotionValue(reduce ? 0 : 1), body = useMotionValue(0);
  const content = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const shown = query.trim() ? results : suggestions;

  useLayoutEffect(() => {
    if (closing) return;
    const node = content.current;
    if (!node) return;
    const fit = (first: boolean) => {
      const height = node.offsetHeight;
      if (reduce) { x.jump(target.x); y.jump(target.y); w.jump(target.width); h.jump(height); radius.jump(14); return; }
      animate(x, target.x, calm); animate(y, target.y, calm); animate(w, target.width, calm);
      animate(h, height, first ? calm : motionTokens.spring.smooth); animate(radius, 14, calm);
    };
    fit(true);
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => fit(false));
    observer.observe(node);
    return () => observer.disconnect();
    // Retarget when the frame resizes or the palette reopens mid-close; the motion values carry the current velocity.
  }, [closing, reduce, target.x, target.y, target.width, x, y, w, h, radius]);

  useEffect(() => {
    if (closing) return;
    animate(shell, 1, { duration: reduce ? motionTokens.duration.fast : 0 });
    animate(body, 1, { duration: reduce ? motionTokens.duration.fast : motionTokens.duration.standard, delay: reduce ? 0 : motionTokens.stagger.line, ease: enterEase });
  }, [body, closing, reduce, shell]);

  useEffect(() => {
    if (!closing) return;
    if (reduce) { const run = animate(shell, 0, { duration: motionTokens.duration.fast }); run.then(onClosed); return () => run.stop(); }
    const { to, mode } = closing;
    animate(body, 0, { duration: motionTokens.duration.instant });
    const spring = mode === "row" ? calm : motionTokens.spring.smooth;
    animate(x, to.x, spring); animate(y, to.y, spring); animate(w, to.width, spring); animate(h, to.height, spring);
    animate(radius, 10, spring);
    const fade = animate(shell, 0, mode === "row" ? { duration: motionTokens.duration.standard, delay: motionTokens.duration.standard } : { duration: motionTokens.duration.instant, delay: motionTokens.duration.standard });
    fade.then(onClosed);
    return () => fade.stop();
  }, [body, closing, h, onClosed, reduce, shell, w, x, y, radius]);

  useEffect(() => { input.current?.focus({ preventScroll: true }); }, []);
  // Scroll only the list; scrollIntoView would also scroll the clipped shell and hide the field.
  useEffect(() => {
    const node = list.current, item = node?.querySelector<HTMLElement>(`[data-index="${active}"]`);
    if (!node || !item) return;
    if (item.offsetTop < node.scrollTop) node.scrollTop = item.offsetTop;
    else if (item.offsetTop + item.offsetHeight > node.scrollTop + node.clientHeight) node.scrollTop = item.offsetTop + item.offsetHeight - node.clientHeight;
  }, [active]);

  function onKey(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!shown.length) return;
      onActive((active + (event.key === "ArrowDown" ? 1 : -1) + shown.length) % shown.length);
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (shown[active]) onPick(shown[active]);
    } else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onClose();
    } else if (event.key === "Tab") {
      event.preventDefault();
    }
  }

  const listId = `${uid}-results`;
  return <motion.div className={styles.palette} role="dialog" aria-modal="true" aria-label="Search settings" style={{ x, y, width: w, height: h, borderRadius: radius, opacity: shell }}>
    <div ref={content} className={styles.paletteContent} style={{ width: target.width }}>
      <div className={styles.paletteField}>
        <Search data-icon-size="md" aria-hidden="true" />
        <input ref={input} value={query} onChange={event => { onQuery(event.target.value); onActive(0); }} onKeyDown={onKey}
          aria-label="Search settings" placeholder="Search settings" role="combobox" aria-expanded="true" aria-controls={listId} aria-autocomplete="list"
          aria-activedescendant={shown[active] ? `${uid}-option-${shown[active].def.id}` : undefined} spellCheck={false} autoComplete="off" />
        <KeyCap>Esc</KeyCap>
      </div>
      <motion.div className={styles.paletteBody} style={{ opacity: body }}>
        {!query.trim() && <p className={styles.paletteHint}>Suggested</p>}
        {shown.length
          ? <LayoutGroup id={`${uid}-palette`}><ul ref={list} id={listId} role="listbox" aria-label="Matching settings" className={styles.results}>
            {shown.map((result, index) => {
              const Icon = Search;
              const selected = index === active;
              return <li key={result.def.id} id={`${uid}-option-${result.def.id}`} data-index={index} role="option" aria-selected={selected}
                className={styles.result} onPointerMove={() => { if (!selected) onActive(index); }} onPointerDown={event => event.preventDefault()} onClick={() => onPick(result)}>
                {selected && <motion.span className={styles.resultHighlight} layoutId="active" transition={reduce ? { duration: 0 } : motionTokens.spring.snappy} aria-hidden="true" />}
                <Icon data-icon-size="sm" aria-hidden="true" />
                <span className={styles.resultText}>
                  <span className={styles.resultLabel}><Highlight text={result.def.label} match={result.match} /></span>
                  <span className={styles.resultDescription}>{result.def.group} · {result.def.description}{result.def.soon ? " · Coming soon" : ""}</span>
                </span>
                <span className={styles.resultEnd} aria-hidden="true">{selected ? <CornerDownLeft data-icon-size="sm" /> : null}</span>
              </li>;
            })}
          </ul></LayoutGroup>
          : <p className={styles.empty} role="status">No settings match “{query.trim()}”</p>}
        <div className={styles.paletteFoot} aria-hidden="true">
          <span><KeyCap>↑</KeyCap><KeyCap>↓</KeyCap> Move</span>
          <span><KeyCap>↵</KeyCap> Jump to setting</span>
        </div>
      </motion.div>
    </div>
  </motion.div>;
}


