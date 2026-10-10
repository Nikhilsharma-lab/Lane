import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const navigation = vi.hoisted(() => ({ project: "AE000000-0000-4000-8000-000000000002" }));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams({ project: navigation.project }),
}));

import { NewRequestLink } from "./new-request-link";

describe("New Request link context", () => {
  it("canonicalizes a valid Project UUID for standalone navigation", () => {
    const html = renderToStaticMarkup(createElement(NewRequestLink, null, "New Request"));
    expect(html).toContain('href="/intake?project=ae000000-0000-4000-8000-000000000002"');
  });
});
