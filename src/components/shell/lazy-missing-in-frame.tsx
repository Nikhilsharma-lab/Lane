"use client";

import { Suspense, lazy, type ComponentProps } from "react";
import type { MissingInFrame } from "./missing-in-frame";

// #271 (A117, A118): the root not-found is part of every route, signed-out ones included, so a static import of
// the frame would put the sidebar and its providers in every route's first load. It loads here on demand instead,
// only when a signed-in person reaches a 404. The server still draws it in the page's HTML.
const Missing = lazy(() => import("./missing-in-frame").then(module => ({ default: module.MissingInFrame })));

export function LazyMissingInFrame(props: ComponentProps<typeof MissingInFrame>) {
  return <Suspense><Missing {...props} /></Suspense>;
}
