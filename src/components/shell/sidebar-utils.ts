export function initials(name: string) {
  return name
    .split(" ")
    .filter((w) => w.length > 0)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

export const NAV_MATCHERS = {
  requests: (p: string) =>
    p === "/" || p === "/intake" || p.startsWith("/requests"),
  settings: (p: string) => p.startsWith("/settings"),
};

export const NAV_ITEM_BASE = "flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm transition-colors";
export const NAV_ITEM_ACTIVE = "bg-brand/[0.06] text-brand";
export const NAV_ITEM_INACTIVE = "text-muted-foreground hover:bg-accent hover:text-accent-foreground";
