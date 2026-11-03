import { describe, expect, it } from "vitest";
import { openSavedView, parseSavedViewName, savedViewChoices, readSavedViewFilters, savedViewFilters, savedViewHref, savedViewChanged, viewInNavigation } from "./saved-view-rules";

const WEBSITE = "11111111-1111-4111-8111-111111111111";

describe("a saved view's filters", () => {
  it("keeps the list's status view and Project", () => {
    expect(savedViewFilters({ status: "in_progress", project: WEBSITE })).toEqual({ status: "in_progress", project: WEBSITE });
    expect(savedViewFilters({ status: "all", project: "none" })).toEqual({ status: "all", project: "none" });
  });

  it("keeps the list of Guest submissions waiting to be taken on", () => {
    expect(savedViewFilters({ status: "waiting", project: "all" })).toEqual({ status: "waiting", project: "all" });
    expect(readSavedViewFilters({ status: "waiting", project: WEBSITE })).toEqual({ status: "waiting", project: WEBSITE });
    expect(savedViewHref({ status: "waiting", project: "all" })).toBe("/?status=waiting");
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

describe("a saved view's title filter (A214)", () => {
  it("is kept with the status view and Project, trimmed, and left out when empty", () => {
    expect(savedViewFilters({ status: "open", project: WEBSITE, title: "  checkout " })).toEqual({ status: "open", project: WEBSITE, title: "checkout" });
    expect(savedViewFilters({ status: "open", project: "all", title: "" })).toEqual({ status: "open", project: "all" });
    expect(savedViewFilters({ status: "open", project: "all", title: "   " })).toEqual({ status: "open", project: "all" });
  });

  it("is limited to the longest Request title when saving", () => {
    expect(savedViewFilters({ status: "all", project: "all", title: "a".repeat(200) })).toEqual({ status: "all", project: "all", title: "a".repeat(200) });
    expect(savedViewFilters({ status: "all", project: "all", title: "a".repeat(201) })).toBeNull();
    expect(savedViewFilters({ status: "all", project: "all", title: 42 })).toBeNull();
  });

  it("reads back what was saved, and an older view without one opens as it did", () => {
    expect(readSavedViewFilters({ status: "open", project: "all", title: "checkout" })).toEqual({ status: "open", project: "all", title: "checkout" });
    expect(readSavedViewFilters({ status: "open", project: WEBSITE })).toEqual({ status: "open", project: WEBSITE });
  });

  it("drops a damaged title but keeps the rest of the view", () => {
    expect(readSavedViewFilters({ status: "open", project: "all", title: ["checkout"] })).toEqual({ status: "open", project: "all" });
  });

  it("opens the list with it", () => {
    expect(savedViewHref({ status: "open", project: "all", title: "checkout button" })).toBe("/?status=open&title=checkout+button");
  });

  it("counts as a change when the list's title differs, and an empty title equals none", () => {
    expect(savedViewChanged({ status: "open", project: "all", title: "checkout" }, { status: "open", project: "all", title: "checkout" })).toBe(false);
    expect(savedViewChanged({ status: "open", project: "all", title: "checkout" }, { status: "open", project: "all", title: "check" })).toBe(true);
    expect(savedViewChanged({ status: "open", project: "all" }, { status: "open", project: "all", title: "" })).toBe(false);
    expect(savedViewChanged({ status: "open", project: "all" }, { status: "open", project: "all", title: "x" })).toBe(true);
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

describe("what the list offers for saved views", () => {
  const open = { id: "v1", name: "Open work", filters: { status: "open" as const, project: "all" } };

  it("offers to save the list as a view when none is open", () => {
    expect(savedViewChoices(null, { status: "done", project: "none" })).toEqual(["save"]);
  });

  it("offers to save as new, rename or delete the open view", () => {
    expect(savedViewChoices(open, { status: "open", project: "all" })).toEqual(["save_as_new", "rename", "delete"]);
  });

  it("offers to save changed filters into the open view first", () => {
    expect(savedViewChoices(open, { status: "closed", project: "all" })).toEqual(["update", "save_as_new", "rename", "delete"]);
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
