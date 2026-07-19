import * as React from "react"
import { mergeProps } from "@base-ui/react/merge-props"
import { useRender } from "@base-ui/react/use-render"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

function RowGroup({
  className,
  render,
  ...props
}: useRender.ComponentProps<"div">) {
  return useRender({
    defaultTagName: "div",
    props: mergeProps<"div">(
      {
        className: cn(
          "flex w-full min-w-0 flex-col divide-y divide-border border-y border-border",
          className
        ),
      },
      props
    ),
    render,
    state: { slot: "row-group" },
  })
}

const rowVariants = cva(
  "group/row relative flex min-h-row-identity-touch w-full min-w-0 items-center gap-3 px-2 py-2.5 text-type-ui outline-none sm:min-h-row-identity",
  {
    variants: {
      interactive: {
        true: "transition-colors hover:bg-muted/60",
        false: "",
      },
    },
    defaultVariants: {
      interactive: false,
    },
  }
)

function Row({
  className,
  interactive = false,
  render,
  ...props
}: useRender.ComponentProps<"div"> & VariantProps<typeof rowVariants>) {
  return useRender({
    defaultTagName: "div",
    props: mergeProps<"div">(
      {
        className: cn(rowVariants({ interactive }), className),
      },
      props
    ),
    render,
    state: { slot: "row", interactive },
  })
}

function RowLeading({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="row-leading"
      className={cn(
        "flex w-8 shrink-0 items-center justify-center self-stretch",
        className
      )}
      {...props}
    />
  )
}

function RowContent({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="row-content"
      className={cn("flex min-w-0 flex-1 flex-col gap-0.5", className)}
      {...props}
    />
  )
}

function RowTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="row-title"
      className={cn(
        "min-w-0 text-type-control font-semibold text-foreground",
        className
      )}
      {...props}
    />
  )
}

function RowDescription({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="row-description"
      className={cn(
        "min-w-0 text-type-meta text-muted-foreground",
        className
      )}
      {...props}
    />
  )
}

function RowMeta({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="row-meta"
      className={cn(
        "min-w-0 text-type-micro text-muted-foreground",
        className
      )}
      {...props}
    />
  )
}

function RowActions({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="row-actions"
      className={cn(
        "flex shrink-0 items-center justify-end gap-1",
        className
      )}
      {...props}
    />
  )
}

export {
  Row,
  RowActions,
  RowContent,
  RowDescription,
  RowGroup,
  RowLeading,
  RowMeta,
  RowTitle,
}
