"use client";

import { useState } from "react";
import { EyeIcon, EyeOffIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export function PasswordField({
  className,
  disabled,
  ...props
}: Omit<React.ComponentProps<typeof Input>, "type">) {
  const [visible, setVisible] = useState(false);

  return (
    <div
      data-slot="password-control"
      className="relative rounded-lg border border-input transition-colors focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 has-aria-invalid:border-destructive has-aria-invalid:ring-3 has-aria-invalid:ring-destructive/20 dark:has-aria-invalid:border-destructive/50 dark:has-aria-invalid:ring-destructive/40"
    >
      <Input
        type={visible ? "text" : "password"}
        className={cn(
          "border-transparent bg-transparent pr-12 focus-visible:border-transparent focus-visible:ring-0 aria-invalid:border-transparent aria-invalid:ring-0 dark:bg-transparent dark:aria-invalid:border-transparent dark:aria-invalid:ring-0",
          className
        )}
        disabled={disabled}
        {...props}
      />
      <button
        type="button"
        aria-label={visible ? "Hide password" : "Show password"}
        aria-pressed={visible}
        aria-controls={props.id}
        disabled={disabled}
        className="absolute inset-y-0 right-0 flex h-full w-control-form-touch items-center justify-center rounded-r-lg text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:bg-muted focus-visible:text-foreground disabled:pointer-events-none disabled:text-disabled-foreground sm:w-control-form"
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => setVisible((current) => !current)}
      >
        {visible ? (
          <EyeOffIcon aria-hidden="true" className="size-4" />
        ) : (
          <EyeIcon aria-hidden="true" className="size-4" />
        )}
      </button>
    </div>
  );
}
