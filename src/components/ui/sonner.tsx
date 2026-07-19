"use client"

import { Toaster as Sonner, type ToasterProps } from "sonner"
import {
  CircleAlertIcon,
  CircleCheckIcon,
  InfoIcon,
  LoaderCircleIcon,
  TriangleAlertIcon,
} from "lucide-react"
import { useTheme } from "next-themes"

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme()

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      closeButton
      gap={8}
      position="bottom-right"
      icons={{
        success: <CircleCheckIcon className="size-4" strokeWidth={1.8} />,
        info: <InfoIcon className="size-4" strokeWidth={1.8} />,
        warning: <TriangleAlertIcon className="size-4" strokeWidth={1.8} />,
        error: <CircleAlertIcon className="size-4" strokeWidth={1.8} />,
        loading: (
          <LoaderCircleIcon
            className="size-4 motion-safe:animate-spin motion-reduce:animate-none"
            strokeWidth={1.8}
          />
        ),
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius)",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast:
            "cn-toast !gap-2.5 !rounded-lg !border !bg-popover !px-3 !py-2.5 !text-popover-foreground !shadow-sm",
          content: "!gap-0.5",
          title: "!text-type-label !font-semibold",
          description: "!text-type-meta !text-muted-foreground",
          icon:
            "!static !m-0 !flex !size-7 !shrink-0 !items-center !justify-center !rounded-md",
          closeButton:
            "!relative !inset-auto !ml-auto !size-7 !shrink-0 !translate-x-0 !translate-y-0 !border-0 !bg-transparent !text-muted-foreground hover:!bg-muted hover:!text-foreground",
          success:
            "!border-success-border [&_[data-icon]]:!bg-success-icon [&_[data-icon]]:!text-success",
          error:
            "!border-destructive-border [&_[data-icon]]:!bg-destructive-icon [&_[data-icon]]:!text-destructive",
          warning:
            "!border-warning-border [&_[data-icon]]:!bg-warning-icon [&_[data-icon]]:!text-warning",
          info:
            "!border-info-border [&_[data-icon]]:!bg-info-icon [&_[data-icon]]:!text-info",
          loading:
            "!border-info-border [&_[data-icon]]:!bg-info-icon [&_[data-icon]]:!text-info",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
