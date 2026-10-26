import { describe, expect, it } from "vitest";
import { openSavedView, parseSavedViewName, readSavedViewFilters, savedViewFilters, savedViewHref, savedViewChanged, viewInNavigation } from "./saved-view-rules";

const WEBSITE = "11111111-1111-4111-8111-111111111111";

describe("a saved view's filters", () => {
  it("keeps the list's status view and Project", () => {
    expect(savedViewFilters({ status: "in_progress", project: WEBSITE })).toEqual({ status: "in_progress", project: WEBSITE });
    expect(savedViewFilters({ status: "all", project: "none" })).toEqual({ status: "all", project: "none" });
  });

  it("reads back what was saved", () => {
    expect(readSavedViewFilters({ status: "measuring", project: WEBSITE })).toEqual({ status: "measuring", project: WEBSITE });
  });

  it("reads anything it doesn't know as every Request, so an old or damaged view never narrows silently to nothing", () => {
    expect(readSavedViewFilters({})).toEqual({ status: "all", project: "all" });
    expect(readSavedViewFilters({ status: "shipped", project: "not-a-project", later: "kept for later" })).toEqual({ status: "all", project: "all" });
    expect(readSavedViewFilters(null)).toEqual({ status: "all", project: "all" });
  });

  it("refuses filters the list doesn't have when saving", () => {
    expect(savedViewFilters({ status: "shipped", project: "all" })).toBeNull();
    expect(savedViewFilters({ status: "open", project: "website" })).toBeNull();
  });

  it("opens the Requests list with them", () => {
    expect(savedViewHref({ status: "due", project: WEBSITE })).toBe(`/?status=due&project=${WEBSITE}`);
    expect(savedViewHref({ status: "all", project: "all" })).toBe("/");
  });

  it("knows when the list has moved away from the view", () => {
    expect(savedViewChanged({ status: "open", project: "all" }, { status: "open", project: "all" })).toBe(false);
    expect(savedViewChanged({ status: "open", project: "all" }, { status: "done", project: "all" })).toBe(true);
    expect(savedViewChanged({ status: "open", project: "all" }, { status: "open", project: "none" })).toBe(true);
  });
});

describe("a saved view's name", () => {
  it("is trimmed", () => {
    expect(parseSavedViewName("  Design in progress ")).toEqual({ name: "Design in progress" });
  });

  it("needs 1 to 60 characters", () => {
    expect(parseSavedViewName("   ")).toEqual({ error: "Give the view a name." });
    expect(parseSavedViewName("x".repeat(61))).toEqual({ error: "Keep the name to 60 characters or fewer." });
    expect(parseSavedViewName("x".repeat(60))).toEqual({ name: "x".repeat(60) });
    expect(parseSavedViewName(42)).toEqual({ error: "Give the view a name." });
  });
});

describe("the open saved view", () => {
  const views = [
    { id: "v1", name: "Open work", filters: { status: "open" as const, project: "all" } },
    { id: "v2", name: "Website", filters: { status: "all" as const, project: WEBSITE } },
  ];

  it("is the one the person opened, while it is still saved", () => {
    expect(openSavedView(views, "v2")).toEqual(views[1]);
    expect(openSavedView(views, "gone")).toBeNull();
    expect(openSavedView(views, undefined)).toBeNull();
  });

  it("is highlighted in the navigation on the list and Request pages, and only there", () => {
    expect(viewInNavigation(views, "v1", "/")).toBe("v1");
    expect(viewInNavigation(views, "v1", "/requests/abc")).toBe("v1");
    expect(viewInNavigation(views, "v1", "/inbox")).toBeNull();
    expect(viewInNavigation(views, "gone", "/")).toBeNull();
  });
});
