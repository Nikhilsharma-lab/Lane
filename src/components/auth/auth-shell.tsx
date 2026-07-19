import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { Typography } from "@/components/ui/typography";
import { cn } from "@/lib/utils";

export function LaneMark() {
  return (
    <span className="flex items-center gap-2.5">
      <svg
        aria-hidden="true"
        viewBox="0 0 100 100"
        className="size-[18px] shrink-0 fill-current"
      >
        <path d="M0 100V0H93.2753L0 100Z" />
        <path d="M0 100H100V6.7247L0 100Z" />
      </svg>
      <Typography as="span" role="wordmark">
        Lane
      </Typography>
    </span>
  );
}

export function AuthHeaderLink({
  prompt,
  href,
  label,
}: {
  prompt: string;
  href: string;
  label: string;
}) {
  return (
    <div className="flex items-center gap-2 text-type-label">
      <span className="text-muted-foreground">{prompt}</span>
      <Link
        href={href}
        className="rounded-sm font-medium text-foreground outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        {label}
      </Link>
    </div>
  );
}

export function AuthShell({
  children,
  headerAction,
  footer,
}: {
  children: React.ReactNode;
  headerAction?: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-1 flex-col bg-background text-foreground">
      <header className="flex h-16 shrink-0 items-center justify-between border-b border-transparent px-6 sm:border-border sm:px-8">
        <Link
          href="/login"
          aria-label="Lane sign in"
          className="rounded-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <LaneMark />
        </Link>
        {headerAction && (
          <div className="hidden items-center sm:flex">{headerAction}</div>
        )}
      </header>

      <main className="flex min-h-0 flex-1 justify-center px-6 pb-7 pt-12 sm:items-center sm:px-8 sm:pb-[78px] sm:pt-12">
        <div className="flex w-full max-w-[380px] flex-1 flex-col sm:flex-initial">
          <div>{children}</div>
          {footer && (
            <div className="mt-auto pt-10 sm:mt-8 sm:pt-0">{footer}</div>
          )}
        </div>
      </main>
    </div>
  );
}

export function AuthHeading({
  title,
  description,
  kicker,
}: {
  title: string;
  description: React.ReactNode;
  kicker?: React.ReactNode;
}) {
  return (
    <div className={cn("flex flex-col", kicker ? "gap-2.5" : "gap-2")}>
      {kicker}
      <Typography as="h1" role="authTitle">
        {title}
      </Typography>
      <Typography as="div" role="ui" className="text-muted-foreground text-pretty">
        {description}
      </Typography>
    </div>
  );
}

export function AuthKicker({
  icon: Icon,
  children,
}: {
  icon: LucideIcon;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2 text-type-meta font-semibold tracking-[0.08em] text-muted-foreground">
      <Icon aria-hidden="true" className="size-4 shrink-0" strokeWidth={1.8} />
      <span>{children}</span>
    </div>
  );
}

export function AuthTrust({
  icon: Icon,
  children,
  className,
}: {
  icon: LucideIcon;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 text-type-meta text-muted-foreground",
        className
      )}
    >
      <Icon aria-hidden="true" className="size-3.5 shrink-0" strokeWidth={1.8} />
      <span>{children}</span>
    </div>
  );
}
