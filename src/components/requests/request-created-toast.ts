import type { ToastOptions } from "@/components/arc/toast-stack/toast-stack";

/**
 * Plan item 2.3: the one place the create toast's copy lives, for the composer
 * dialog wherever it opens. When the list's filters leave the new Request out, the toast
 * says so and offers to show it; filters are never cleared silently. The
 * alignment increment changes "Open and ready to be picked up." here once its
 * guard ships.
 */
export function requestCreatedToast({ hidden = false, onOpen, onShow }: {
  hidden?: boolean;
  onOpen?: () => void;
  onShow?: () => void;
}): ToastOptions {
  if (hidden) {
    return {
      type: "success",
      title: "Request created",
      description: "It’s hidden by your current filters.",
      action: onShow ? { label: "Show it", onClick: onShow } : undefined,
      duration: 10_000,
    };
  }
  return {
    type: "success",
    title: "Request created",
    description: "Open and ready to be picked up.",
    action: onOpen ? { label: "Open Request", onClick: onOpen } : undefined,
  };
}
