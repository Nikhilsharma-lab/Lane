import type { ComponentType } from "react";
import Link from "next/link";

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
      <p
        className="text-foreground"
        style={{
          fontSize: 14,
          fontWeight: 560,
          textAlign: "center",
        }}
      >
        {title}
      </p>
      {subtitle && (
        <p
          className="text-muted-foreground"
          style={{
            fontSize: 13,
            textAlign: "center",
            marginTop: 6,
            maxWidth: 320,
            lineHeight: 1.5,
          }}
        >
          {subtitle}
        </p>
      )}
      {cta && (
        <div className="mt-4">
          {cta.href ? (
            <Link
              href={cta.href}
              className="text-primary no-underline"
              style={{
                fontSize: 13,
                fontWeight: 520,
              }}
            >
              {cta.label} →
            </Link>
          ) : (
            <button
              onClick={cta.onClick}
              className="text-primary"
              style={{
                fontSize: 13,
                fontWeight: 520,
                background: "none",
                border: "none",
                cursor: "pointer",
              }}
            >
              {cta.label} →
            </button>
          )}
        </div>
      )}
    </div>
  );
}
