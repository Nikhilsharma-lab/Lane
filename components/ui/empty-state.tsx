import type { ComponentType } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

interface EmptyStateProps {
  icon?: ComponentType<{ size?: string | number }>;
  title: string;
  subtitle?: string;
  cta?: { label: string; href?: string; onClick?: () => void };
}

export function EmptyState({
  icon: Icon,
  title,
  subtitle,
  cta,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4">
      {Icon && (
        <div className="mb-4 opacity-30">
          <Icon size={40} />
        </div>
      )}
      <p className="text-sm font-semibold text-foreground text-center">
        {title}
      </p>
      {subtitle && (
        <p className="text-[13px] text-muted-foreground text-center mt-1.5 max-w-xs leading-normal">
          {subtitle}
        </p>
      )}
      {cta && (
        <div className="mt-4">
          {cta.href ? (
            <Link href={cta.href} className="text-[13px] font-medium text-primary hover:underline">
              {cta.label} →
            </Link>
          ) : (
            <Button
              variant="link"
              onClick={cta.onClick}
              className="text-[13px] font-medium"
            >
              {cta.label} →
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
