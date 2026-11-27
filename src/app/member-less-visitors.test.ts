/**
 * #387 (spec #383 "The session seam"): where each page and layout sends someone with no workspace to show. The
 * session is faked at the seam's read; the rest of the seam, the pages and their guards are real.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RETURN_ADDRESS_HEADER } from "@/lib/auth-return-address";
import type { Session } from "@/lib/session";
import { AppProviders } from "@/test/app-providers";

const visit = vi.hoisted(() => ({ session: null as Session | null, address: "/" }));
vi.mock("@/lib/session", async (original) => ({ ...(await original<typeof import("@/lib/session")>()), readSession: async () => visit.session, readWorkspaceLeft: async () => null }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ [RETURN_ADDRESS_HEADER]: visit.address }) }));
vi.mock("next/navigation", async (original) => ({
  ...(await original<typeof import("next/navigation")>()),
  usePathname: () => visit.address,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

const REQUEST = "5f9a1c7e-3b52-4d08-9c61-7e2f4a8b0d13";
const search = Promise.resolve({});
const params = Promise.resolve({ id: REQUEST });

const ADDRESSES: [name: string, address: string, open: () => Promise<unknown>][] = [
  ["the app layout", "/projects?x=1", async () => (await import("./(app)/layout")).default({ children: null })],
  ["the Requests list", "/?status=open", async () => (await import("./(app)/requests-workspace")).RequestsWorkspace()],
  ["a Request", `/requests/${REQUEST}?view=board`, async () => (await import("./(app)/request-detail-workspace")).RequestDetailWorkspace({ selectedRequestId: REQUEST })],
  ["Intake", "/intake?from=inbox", async () => (await import("./(app)/intake/page")).default()],
  ["the Inbox", `/inbox?item=${REQUEST}`, async () => (await import("./(app)/inbox/page")).default({ searchParams: search })],
  ["Impact", "/impact?tab=report", async () => (await import("./(app)/impact/page")).default({ searchParams: search })],
  ["Settings: Profile", "/settings/profile?section=members", async () => (await import("./(app)/settings/profile/page")).default({ searchParams: search })],
  ["Settings: Members", "/settings/members", async () => (await import("./(app)/settings/members/page")).default()],
  ["Settings: Metrics", "/settings/metrics?show=archived", async () => (await import("./(app)/settings/metrics/(library)/page")).default({ searchParams: search })],
  ["Settings: a Metric", `/settings/metrics/${REQUEST}`, async () => (await import("./(app)/settings/metrics/[id]/page")).default({ params, searchParams: search })],
];
const ONBOARDING: (typeof ADDRESSES)[number] = ["Onboarding", "/onboarding", async () => (await import("./(auth)/onboarding/page")).default({ searchParams: search })];

/** Where opening it redirects to, or what it renders. */
async function redirectOf(open: () => Promise<unknown>) {
  try {
    return { rendered: await open() };
  } catch (error) {
    const digest = (error as { digest?: string }).digest;
    if (!digest?.startsWith("NEXT_REDIRECT;")) throw error;
    return digest.split(";")[2];
  }
}

beforeEach(() => Object.assign(visit, { session: null, address: "/" }));

describe("someone signed out", () => {
  it.each([...ADDRESSES, ONBOARDING])("goes from %s to sign in, and back to it afterwards", async (_name, address, open) => {
    visit.address = address;
    expect(await redirectOf(open)).toBe(`/login?redirect_url=${encodeURIComponent(address)}`);
  });

  it.each(["https://x", "//x", "/\\x"])("never gets an unsafe return address: %s", async (address) => {
    visit.address = address;
    for (const [, , open] of [...ADDRESSES, ONBOARDING]) expect(await redirectOf(open)).toBe("/login");
  });
});

describe.each<[string, Session]>([
  ["someone signed in with no workspace", { userId: "user_memberless", orgId: null, role: null }],
  ["someone signed in whose role Lane doesn't know", { userId: "user_memberless", orgId: "org_test_a", role: null }],
])("%s", (_who, session) => {
  beforeEach(() => { visit.session = session; });

  it.each(ADDRESSES)("goes from %s to Onboarding", async (_name, address, open) => {
    visit.address = address;
    expect(await redirectOf(open)).toBe("/onboarding");
  });

  it("sees Onboarding's workspace step, so nothing loops", async () => {
    const opened = await redirectOf(ONBOARDING[2]);
    expect(opened).toHaveProperty("rendered");
    const { rendered } = opened as { rendered: React.ReactNode };
    expect(renderToStaticMarkup(createElement(AppProviders, null, rendered))).toContain("Create your workspace");
  });
});

describe("an address no page answers", () => {
  const shown = async () => renderToStaticMarkup(createElement(AppProviders, null, await (await import("./not-found")).default({ params: Promise.resolve({}) })));

  it("offers Sign in to someone signed out, and Go to Lane to someone signed in with no workspace", async () => {
    expect(await shown()).toMatch(/<a\b[^>]*href="\/login"[^>]*>Sign in<\/a>/);
    visit.session = { userId: "user_memberless", orgId: null, role: null };
    const html = await shown();
    expect(html).toContain("Go to Lane");
    expect(html).not.toContain("Sign in");
  });
});
