"use client";

import { usePathname } from "next/navigation";
import { MissingPage } from "./missing-page";
import { RequestUnavailable } from "@/components/requests/request-unavailable";
import { requestListHref } from "@/lib/request-workspace";
import { WorkspaceFrame, useInWorkspaceFrame, type WorkspaceFrameProps } from "./workspace-frame";

/** The address the frame treats as current: no sidebar item is, and a missing /settings/… address keeps the sidebar. */
const MISSING_PAGE = "/not-found";
/** The one address shape whose 404 is a Request's: requests/[id]/layout.tsx answers an unknown Request with it. */
const REQUEST_ADDRESS = /^\/requests\/[^/]+\/?$/;


type FrameProps = Omit<WorkspaceFrameProps, "children" | "pageAddress">;
const isFrame = (props: Partial<FrameProps>): props is FrameProps => props.orgId !== undefined;

/**
 * #271: the root not-found's screen for a signed-in person, inside the app frame with the sidebar. An unknown
 * Request (A117) keeps "This Request can't be opened"; any other address gets "Page not found" (A118). It is
 * loaded on demand (lazy-missing-in-frame.tsx), so the frame never joins every route's first load. A 404 thrown
 * under the (app) layout (an unknown Request, a missing Metric) has its own not-found inside that layout's frame
 * (requests/not-found.tsx, settings/metrics/not-found.tsx).
 */
export function MissingInFrame(props: Partial<FrameProps>) {
  const request = REQUEST_ADDRESS.test(usePathname());
  const content = request
    ? <div data-slot="requests-workspace" className="flex min-h-0 flex-1 sm:h-full sm:overflow-hidden"><RequestUnavailable returnHref={requestListHref("all")} /></div>
    : <MissingPage />;
  if (useInWorkspaceFrame() || !isFrame(props)) return content;
  return <WorkspaceFrame {...props} pageAddress={request ? undefined : MISSING_PAGE}>{content}</WorkspaceFrame>;
}
