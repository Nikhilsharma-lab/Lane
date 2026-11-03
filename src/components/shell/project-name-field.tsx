"use client";

import type { Ref } from "react";
import type { InputProps } from "@/components/arc/input/input";
import { Input } from "@/components/arc/input/input";
import { charactersLeftNote } from "@/lib/character-count";
import { PROJECT_NAME_MAX } from "@/lib/request-constants";

/**
 * #269 (A19, A110): the sidebar's New Project field, Arc `input` with its error under the field and the shared
 * counter near the 80-character limit. Its own chunk, fetched once the page is idle (and as the pointer or focus
 * reaches New Project), so the field's code stays out of every page's first load; the composer draws a plain field
 * with the same look until it arrives.
 */
export function ProjectNameField({ ref, ...props }: Omit<InputProps, "label" | "maxLength" | "description"> & { value: string; ref?: Ref<HTMLInputElement> }) {
  return <Input {...props} ref={ref} label="Project name" hideLabel appearance="plain" maxLength={PROJECT_NAME_MAX} description={charactersLeftNote(props.value, PROJECT_NAME_MAX)} />;
}
