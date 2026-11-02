"use client";

import Link from "@/components/link";
import { usePathname } from "next/navigation";
import { Compass } from "lucide-react";
import { EmptyState } from "@/components/arc/empty-state/empty-state";
import buttonStyles from "@/components/arc/button/button.module.css";
import { PageStrip } from "@/components/shell/page-strip";
import { RequestUnavailable } from "@/components/requests/request-unavailable";
import { requestListHref } from "@/lib/request-workspace";
import { WorkspaceFrame, type WorkspaceFrameProps } from "./workspace-frame";

/** The address the frame treats as current: no sidebar item is, and a missing /settings/… address keeps the sidebar. */
const MISSING_PAGE = "/not-found";
/** The one address shape whose 404 is a Request's: requests/[id]/layout.tsx answers an unknown Request with it. */
const REQUEST_ADDRESS = /^\/requests\/[^/]+\/?$/;
const buttonLink = `${buttonStyles.button} ${buttonStyles.secondary} ${buttonStyles.md}`;

/** #271 (A118): a signed-in "Page not found". The strip names the place; the one heading says what happened. */
export function MissingPage() {
  return <div className="flex min-h-full flex-col">
    <PageStrip title="Page not found" />
    <div className="flex flex-1 flex-col justify-center p-6">
      <EmptyState
        title="This page doesn’t exist"
        description="Check the address, or go back to your Requests."
        icon={<Compass aria-hidden="true" />}
        action={<Link href="/" className={buttonLink}>Go to Requests</Link>}
      />
    </div>
  </div>;
}

/**
 * #271: the root not-found's screen for a signed-in person, inside the app frame with the sidebar. An unknown
 * Request (A117) keeps "This Request can't be opened"; any other address gets "Page not found" (A118). It is
 * loaded on demand (lazy-missing-in-frame.tsx), so the frame never joins every route's first load.
 */
export function MissingInFrame(props: Omit<WorkspaceFrameProps, "children" | "pageAddress">) {
  const request = REQUEST_ADDRESS.test(usePathname());
  return <WorkspaceFrame {...props} pageAddress={request ? undefined : MISSING_PAGE}>
    {request
      ? <div data-slot="requests-workspace" className="flex min-h-0 flex-1 sm:h-full sm:overflow-hidden"><RequestUnavailable returnHref={requestListHref("all")} /></div>
      : <MissingPage />}
  </WorkspaceFrame>;
}
