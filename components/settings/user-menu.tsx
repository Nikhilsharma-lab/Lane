"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { logout } from "@/app/actions/auth";

interface UserMenuProps {
  fullName: string;
}

export function UserMenu({ fullName }: UserMenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        {fullName}
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1.5 w-48 bg-card border border-border rounded-xl shadow-xl z-50 py-1 overflow-hidden">
          <p className="px-3 py-2 text-xs text-muted-foreground border-b border-border truncate">
            {fullName}
          </p>
          <Link
            href="/settings/account"
            onClick={() => setOpen(false)}
            className="flex items-center px-3 py-2 text-sm text-foreground hover:bg-accent transition-colors"
          >
            Settings
          </Link>
          <form action={logout}>
            <button
              type="submit"
              className="w-full text-left flex items-center px-3 py-2 text-sm text-foreground hover:bg-accent transition-colors"
            >
              Sign out
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
