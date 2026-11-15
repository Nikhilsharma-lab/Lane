"use client";

import { useState, type ClipboardEvent, type ComponentProps } from "react";
import { useWatch, type Control } from "react-hook-form";
import { Textarea } from "@/components/arc/textarea/textarea";
import type { RequestInput } from "@/lib/request-schema";

/** The share of a limit after which the field says how much room is left. */
const NEAR_LIMIT = 0.9;

/**
 * #285 (C3): what a paste into a field holding `value`, with `start`–`end` selected, can keep under `max`: the start
 * of the pasted text that fits, and how many characters were left out. A character made of two code units is never
 * split. Line breaks count once, as the field stores them.
 */
export function fitPaste(value: string, start: number, end: number, pasted: string, max: number): { text: string; leftOut: number } {
  const text = pasted.replace(/\r\n?/g, "\n");
  const room = Math.max(0, max - (value.length - (end - start)));
  if (text.length <= room) return { text, leftOut: 0 };
  const kept = /[\uD800-\uDBFF]$/.test(text.slice(0, room)) ? text.slice(0, room - 1) : text.slice(0, room);
  return { text: kept, leftOut: text.length - kept.length };
}

const characters = (count: number) => `${count.toLocaleString("en-GB")} ${count === 1 ? "character" : "characters"}`;
const roomLeft = (left: number) => left === 0 ? "No characters left" : `${characters(left)} left`;
const leftOutWords = (count: number) => `${characters(count)} didn’t fit and ${count === 1 ? "was" : "were"} left out.`;

/**
 * The composer's title or description with its limit in view (#285, C3): near the limit it says how much room is left,
 * and a paste that doesn't fit keeps what fits and says how much was left out, instead of the browser cutting it
 * silently. Only this field renders as its length changes near the limit; the form around it doesn't.
 */
export function LimitedTextarea({ control, name, limit: max, onChange, ...props }: Omit<ComponentProps<typeof Textarea>, "description" | "maxLength" | "name"> & {
  control: Control<RequestInput>;
  name: "title" | "description";
  limit: number;
}) {
  const left = useWatch({ control, name, compute: (value: string | undefined) => (value?.length ?? 0) >= max * NEAR_LIMIT ? max - (value?.length ?? 0) : null });
  // What the last overflowing paste left out, until the text changes again.
  const [leftOut, setLeftOut] = useState<{ count: number; value: string } | null>(null);

  function paste(event: ClipboardEvent<HTMLTextAreaElement>) {
    const field = event.currentTarget;
    const fit = fitPaste(field.value, field.selectionStart, field.selectionEnd, event.clipboardData.getData("text/plain"), max);
    if (!fit.leftOut) return;
    event.preventDefault();
    // insertText keeps the paste on the field's undo stack and fires the input event the form listens to.
    if (fit.text && !document.execCommand("insertText", false, fit.text)) {
      field.setRangeText(fit.text, field.selectionStart, field.selectionEnd, "end");
      field.dispatchEvent(new Event("input", { bubbles: true }));
    }
    setLeftOut({ count: fit.leftOut, value: field.value });
  }

  const message = leftOut ? leftOutWords(leftOut.count) : left === null ? undefined : roomLeft(left);
  return <>
    <Textarea {...props} name={name} maxLength={max} description={message} onPaste={paste}
      onChange={event => { if (leftOut && event.target.value !== leftOut.value) setLeftOut(null); return onChange?.(event); }} />
    {/* The field's own line isn't announced; what a paste left out is. */}
    <span className="sr-only" role="status">{leftOut ? leftOutWords(leftOut.count) : ""}</span>
  </>;
}
