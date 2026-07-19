import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const typographyVariants = cva("", {
  variants: {
    role: {
      display: "max-w-[22ch] text-type-display text-balance",
      authTitle:
        "max-w-[22ch] text-type-auth-title-mobile text-balance sm:text-type-auth-title",
      pageTitle:
        "max-w-[22ch] text-type-page-title-mobile text-balance sm:text-type-page-title",
      sectionTitle: "max-w-[22ch] text-type-section-title text-balance",
      prose: "max-w-[68ch] text-type-prose text-pretty",
      ui: "text-type-ui",
      control: "text-type-control",
      label: "text-type-label",
      support: "text-type-support",
      meta: "text-type-meta",
      micro: "font-mono text-type-micro",
      wordmark: "text-type-wordmark",
    },
  },
  defaultVariants: {
    role: "ui",
  },
})

type TypographyRole = NonNullable<
  VariantProps<typeof typographyVariants>["role"]
>

type TypographyProps<T extends React.ElementType> = {
  as?: T
  role?: TypographyRole
  className?: string
} & Omit<React.ComponentPropsWithoutRef<T>, "as" | "className">

function Typography<T extends React.ElementType = "span">({
  as,
  role = "ui",
  className,
  ...props
}: TypographyProps<T>) {
  const Component = as ?? "span"

  return (
    <Component
      data-slot="typography"
      data-role={role}
      className={cn(typographyVariants({ role }), className)}
      {...props}
    />
  )
}

export {
  Typography,
  typographyVariants,
  type TypographyProps,
  type TypographyRole,
}
