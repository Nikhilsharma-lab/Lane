"use client";

import { useState } from "react";
import Link from "next/link";
import { signup } from "@/app/actions/auth";

export default function SignupPage() {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(formData: FormData) {
    setLoading(true);
    setError(null);
    const result = await signup(formData);
    if (result?.error) {
      setError(result.error);
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[var(--bg-base)] flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="mb-8">
          <h1 className="text-xl font-semibold text-[var(--text-primary)]">Lane</h1>
          <p className="text-[var(--text-secondary)] text-sm mt-1">Create your workspace</p>
        </div>

        <form action={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-[var(--text-secondary)] mb-1.5">Full name</label>
            <input
              name="fullName"
              type="text"
              required
              autoComplete="name"
              className="w-full bg-[var(--bg-subtle)] border border-[var(--border)] rounded-lg px-3 py-2.5 text-sm text-[var(--text-primary)] placeholder-[var(--text-tertiary)] focus:outline-none focus:border-[var(--border-strong)] transition-colors"
              placeholder="Nikhil Sharma"
            />
          </div>

          <div>
            <label className="block text-sm text-[var(--text-secondary)] mb-1.5">Organization name</label>
            <input
              name="orgName"
              type="text"
              required
              className="w-full bg-[var(--bg-subtle)] border border-[var(--border)] rounded-lg px-3 py-2.5 text-sm text-[var(--text-primary)] placeholder-[var(--text-tertiary)] focus:outline-none focus:border-[var(--border-strong)] transition-colors"
              placeholder="Acme Design Team"
            />
          </div>

          <div>
            <label className="block text-sm text-[var(--text-secondary)] mb-1.5">Work email</label>
            <input
              name="email"
              type="email"
              required
              autoComplete="email"
              className="w-full bg-[var(--bg-subtle)] border border-[var(--border)] rounded-lg px-3 py-2.5 text-sm text-[var(--text-primary)] placeholder-[var(--text-tertiary)] focus:outline-none focus:border-[var(--border-strong)] transition-colors"
              placeholder="you@company.com"
            />
          </div>

          <div>
            <label className="block text-sm text-[var(--text-secondary)] mb-1.5">Password</label>
            <input
              name="password"
              type="password"
              required
              autoComplete="new-password"
              minLength={8}
              className="w-full bg-[var(--bg-subtle)] border border-[var(--border)] rounded-lg px-3 py-2.5 text-sm text-[var(--text-primary)] placeholder-[var(--text-tertiary)] focus:outline-none focus:border-[var(--border-strong)] transition-colors"
              placeholder="Min. 8 characters"
            />
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[var(--accent)] text-[var(--accent-text)] rounded-lg py-2.5 text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "Creating workspace…" : "Create workspace"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-[var(--text-secondary)]">
          Already have an account?{" "}
          <Link href="/login" className="text-[var(--text-primary)] hover:text-[var(--accent)] transition-colors">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
