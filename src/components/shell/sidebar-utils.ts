export { identityInitials as initials } from "@/lib/identity";

export const NAV_MATCHERS = {
  requests: (p: string) =>
    p === "/" || p === "/intake" || p.startsWith("/requests"),
  settings: (p: string) => p.startsWith("/settings"),
};

export const NAV_ITEM_BASE = "flex min-h-control-product items-center gap-2.5 rounded-md px-2.5 py-1.5 text-type-control transition-colors";
export const NAV_ITEM_ACTIVE = "bg-brand-soft text-brand";
export const NAV_ITEM_INACTIVE = "text-muted-foreground hover:bg-accent hover:text-accent-foreground";
