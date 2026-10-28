import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkspaceSidebarProps } from "@/components/arc/blocks/workspace-sidebar/workspace-sidebar";
import { AppProviders } from "@/test/app-providers";

// #258: opening the account menu loads its Settings destinations ahead. Members is offered, and loaded
// ahead, only to an Admin or a Member: never to a Viewer (#210) or a Guest (#212). The development Clerk
// instance has neither role, so this is where they are covered.

const prefetch = vi.fn();
let sidebar: WorkspaceSidebarProps | null = null;

vi.mock("@clerk/nextjs", () => ({ useOrganization: () => ({ isLoaded: false }), useClerk: () => ({ signOut: vi.fn() }) }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch }),
}));
// The Arc block owns the menu itself; what the shell hands it is what the person is offered.
vi.mock("@/components/arc/blocks/workspace-sidebar/workspace-sidebar", () => ({
  WorkspaceSidebar: (props: WorkspaceSidebarProps) => { sidebar = props; return null; },
}));

import { SidebarView } from "./sidebar-view";

function openAccountMenu(role: string) {
  sidebar = null;
  prefetch.mockClear();
  renderToStaticMarkup(createElement(AppProviders, null, createElement(SidebarView, {
    workspaceName: "Lane Studio", fullName: "Test Person", email: "person@example.test", role, pathname: "/", projects: [], notifications: null,
  })));
  sidebar!.onAccountMenuOpen?.();
  return { members: sidebar!.membersHref, loaded: prefetch.mock.calls.map(([href]) => href) };
}

describe("The account menu's Settings, loaded ahead (#258)", () => {
  beforeEach(() => { prefetch.mockClear(); });

  it.each(["viewer", "guest"])("offers a %s no Members and loads only Settings → Profile ahead", (role) => {
    expect(openAccountMenu(role)).toEqual({ members: undefined, loaded: ["/settings/profile"] });
  });

  it.each(["admin", "member"])("offers an %s Members and loads it ahead with Settings → Profile", (role) => {
    expect(openAccountMenu(role)).toEqual({ members: "/settings/members", loaded: ["/settings/profile", "/settings/members"] });
  });
});
