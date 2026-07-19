import { clsx, type ClassValue } from "clsx"
import { extendTailwindMerge } from "tailwind-merge"

const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      text: [
        "type-display",
        "type-auth-title",
        "type-auth-title-mobile",
        "type-page-title",
        "type-page-title-mobile",
        "type-section-title",
        "type-prose",
        "type-ui",
        "type-control",
        "type-label",
        "type-support",
        "type-meta",
        "type-micro",
        "type-wordmark",
      ],
      spacing: [
        "control-utility",
        "control-product",
        "control-form",
        "control-form-touch",
        "touch-target",
        "row-identity",
        "row-identity-touch",
        "row-leading",
      ],
    },
  },
})

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
