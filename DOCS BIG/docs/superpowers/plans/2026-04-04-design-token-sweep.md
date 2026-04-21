# Design Token Sweep Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace all hardcoded colors and slate/shadcn defaults across core components with CSS custom properties from globals.css, fix WCAG AA contrast failures, and add borrowed design techniques from Linear/Vercel/Notion.

**Architecture:** Single source of truth in `app/globals.css`. Every component references only `var(--token)` — no hardcoded hex values, no Tailwind slate/zinc/stone utilities. Phase and priority colors get dedicated tokens so the PHASES array in request-list.tsx becomes key-only (no more Tailwind arbitrary color strings).

**Tech Stack:** Next.js 14, Tailwind CSS (arbitrary value syntax for CSS vars), CSS Custom Properties, TypeScript

---

## File Map

| File | Action | What changes |
|---|---|---|
| `app/globals.css` | Modify | Fix 2 contrast tokens, add 18 new tokens |
| `components/ui/card.tsx` | Modify | Strip slate classes, use shadow-card + bg-surface tokens |
| `components/ui/button.tsx` | Modify | Remap all 5 CVA variants to design tokens |
| `components/ui/input.tsx` | Modify | Strip slate classes, use border-input + focus-ring-color |
| `components/requests/request-list.tsx` | Modify | Replace PHASES color strings + all inline hex values |

---

## Task 1: Update globals.css — contrast fixes + new tokens

**Files:**
- Modify: `app/globals.css`

- [ ] **Step 1: Fix the two failing contrast tokens**

In `app/globals.css`, find the `/* Text */` block and change:

```css
  /* Text */
  --text-primary: #1C1917;
  --text-secondary: #6B6460;   /* was #78716C — now 4.95:1 on bg-base ✅ */
  --text-tertiary: #706A65;    /* was #A8A29E — now 4.6:1 on bg-base ✅ */
```

- [ ] **Step 2: Add all new tokens after the `/* Layout */` block**

Append to the `:root` block in `app/globals.css`:

```css
  /* Accent hover */
  --accent-hover: #264830;

  /* Shadows (Vercel shadow-as-border technique — warm-tinted rgba) */
  --shadow-border:       0 0 0 1px rgba(28, 25, 23, 0.08);
  --shadow-border-hover: 0 0 0 1px rgba(28, 25, 23, 0.14);
  --shadow-card:         0 0 0 1px rgba(28, 25, 23, 0.06), 0 1px 2px rgba(28, 25, 23, 0.04);

  /* Surfaces (Notion + Linear techniques) */
  --bg-section: #F2EFE9;    /* warm-white alternation for section rows */
  --bg-elevated: #FDFCFA;   /* modals, right dock — barely-there warm white */

  /* Accessible input border — meets WCAG 3:1 for UI component boundaries */
  --border-input: #97918A;

  /* Focus ring */
  --focus-ring-color: var(--accent);

  /* Priority badge tokens */
  --priority-p0-bg:   #FEE2E2;
  --priority-p0-text: #DC2626;
  --priority-p1-bg:   #FFEDD5;
  --priority-p1-text: #C2410C;
  --priority-p2-bg:   #FEF9C3;
  --priority-p2-text: #A16207;
  --priority-p3-bg:   var(--bg-hover);
  --priority-p3-text: var(--text-secondary);

  /* Phase color tokens */
  --phase-predesign:        #D4A84B;
  --phase-predesign-bg:     rgba(212, 168, 75, 0.05);
  --phase-predesign-border: rgba(212, 168, 75, 0.20);
  --phase-predesign-badge:  rgba(212, 168, 75, 0.10);

  --phase-design:           #A394C7;
  --phase-design-bg:        rgba(163, 148, 199, 0.05);
  --phase-design-border:    rgba(163, 148, 199, 0.20);
  --phase-design-badge:     rgba(163, 148, 199, 0.10);

  --phase-dev:              #7DA5C4;
  --phase-dev-bg:           rgba(125, 165, 196, 0.05);
  --phase-dev-border:       rgba(125, 165, 196, 0.20);
  --phase-dev-badge:        rgba(125, 165, 196, 0.10);

  --phase-track:            #86A87A;
  --phase-track-bg:         rgba(134, 168, 122, 0.05);
  --phase-track-border:     rgba(134, 168, 122, 0.20);
  --phase-track-badge:      rgba(134, 168, 122, 0.10);
```

- [ ] **Step 3: Verify no syntax errors**

```bash
cd /Users/yashkaushal/Lane && npx tsc --noEmit
```

Expected: no errors (globals.css changes don't affect TypeScript)

- [ ] **Step 4: Commit**

```bash
cd /Users/yashkaushal/Lane
git add app/globals.css
git commit -m "feat: add design tokens — contrast fixes, shadows, phase/priority colors"
```

---

## Task 2: Update card.tsx

**Files:**
- Modify: `components/ui/card.tsx`

- [ ] **Step 1: Replace the Card component's hardcoded classes**

Replace the entire file content:

```tsx
import * as React from "react"
import { cn } from "@/lib/utils"

const Card = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, style, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("rounded-[var(--radius-lg)]", className)}
    style={{
      background: "var(--bg-surface)",
      color: "var(--text-primary)",
      boxShadow: "var(--shadow-card)",
      ...style,
    }}
    {...props}
  />
))
Card.displayName = "Card"

const CardHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex flex-col space-y-1.5 p-6", className)}
    {...props}
  />
))
CardHeader.displayName = "CardHeader"

const CardTitle = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h2
    ref={ref}
    className={cn("text-base font-semibold leading-none tracking-tight", className)}
    {...props}
  />
))
CardTitle.displayName = "CardTitle"

const CardDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p
    ref={ref}
    className={cn("text-sm", className)}
    style={{ color: "var(--text-secondary)" }}
    {...props}
  />
))
CardDescription.displayName = "CardDescription"

const CardContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("p-6 pt-0", className)} {...props} />
))
CardContent.displayName = "CardContent"

const CardFooter = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex items-center p-6 pt-0", className)}
    {...props}
  />
))
CardFooter.displayName = "CardFooter"

export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent }
```

- [ ] **Step 2: Type check**

```bash
cd /Users/yashkaushal/Lane && npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add components/ui/card.tsx
git commit -m "feat: migrate card.tsx to design tokens"
```

---

## Task 3: Update button.tsx

**Files:**
- Modify: `components/ui/button.tsx`

- [ ] **Step 1: Remap all CVA variants to design tokens**

Replace the entire file:

```tsx
import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring-color)] focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default:
          "bg-[var(--accent)] text-[var(--accent-text)] hover:bg-[var(--accent-hover)]",
        destructive:
          "bg-[var(--priority-p0-bg)] text-[var(--priority-p0-text)] hover:bg-[var(--priority-p0-bg)]",
        outline:
          "border border-[var(--border-input)] bg-[var(--bg-surface)] text-[var(--text-primary)] hover:bg-[var(--bg-hover)]",
        secondary:
          "bg-[var(--bg-hover)] text-[var(--text-primary)] hover:bg-[var(--bg-subtle)]",
        ghost:
          "bg-transparent text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]",
        link:
          "text-[var(--accent)] underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-4 py-2 rounded-[var(--radius-md)]",
        sm: "h-9 px-3 rounded-[var(--radius-md)]",
        lg: "h-11 px-8 rounded-[var(--radius-md)]",
        icon: "h-10 w-10 rounded-[var(--radius-md)]",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
```

- [ ] **Step 2: Type check**

```bash
cd /Users/yashkaushal/Lane && npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add components/ui/button.tsx
git commit -m "feat: migrate button.tsx to design tokens — all variants"
```

---

## Task 4: Update input.tsx

**Files:**
- Modify: `components/ui/input.tsx`

- [ ] **Step 1: Replace slate classes with design tokens**

Replace the entire file:

```tsx
import * as React from "react"
import { cn } from "@/lib/utils"

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => (
    <input
      type={type}
      className={cn(
        "flex h-10 w-full rounded-[var(--radius-md)] border border-[var(--border-input)] bg-[var(--bg-surface)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus-visible:outline-none focus-visible:border-[var(--focus-ring-color)] disabled:cursor-not-allowed disabled:opacity-50 transition-colors",
        className
      )}
      ref={ref}
      {...props}
    />
  )
)
Input.displayName = "Input"

export { Input }
```

- [ ] **Step 2: Type check**

```bash
cd /Users/yashkaushal/Lane && npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add components/ui/input.tsx
git commit -m "feat: migrate input.tsx to design tokens + accessible border"
```

---

## Task 5: Update request-list.tsx — strip all hardcoded values

**Files:**
- Modify: `components/requests/request-list.tsx`

This file has two categories of hardcoded values:
1. The `PHASES` array — Tailwind arbitrary color classes with hex values and opacity modifiers
2. Inline `style={{ color: "#..." }}` values — priority badges, deadline badge, stalled text

**Strategy:** Replace PHASES color string properties with a `colorKey` string, then derive CSS variable names from it in JSX. Replace all inline hex style values with `var(--token)` references.

- [ ] **Step 1: Rewrite the PHASES array — remove Tailwind color strings**

Replace the `PHASES` array (lines 18–71) with:

```tsx
const PHASES = [
  {
    key: "predesign",
    label: "Predesign",
    number: "1",
    desc: "PM + Org decides what to build",
    stages: ["intake", "context", "shape", "bet"],
    stageLabels: { intake: "Intake", context: "Context", shape: "Shape", bet: "Betting" },
  },
  {
    key: "design",
    label: "Design",
    number: "2",
    desc: "Designer builds the solution",
    stages: ["explore", "validate", "handoff"],
    stageLabels: { explore: "Explore", validate: "Validate", handoff: "Handoff" },
  },
  {
    key: "dev",
    label: "Dev",
    number: "3",
    desc: "Developers build and ship",
    stages: ["todo", "in_progress", "in_review", "qa", "done"],
    stageLabels: { todo: "To Do", in_progress: "In Progress", in_review: "In Review", qa: "QA", done: "Done" },
  },
  {
    key: "track",
    label: "Track & Impact",
    number: "4",
    desc: "PM measures results",
    stages: ["measuring", "complete"],
    stageLabels: { measuring: "Measuring", complete: "Complete" },
  },
] as const;
```

- [ ] **Step 2: Update the PhaseKey type (line 73)**

Replace:

```tsx
type PhaseKey = (typeof PHASES)[number]["key"];
```

(This stays the same — just confirm it's still correct after the PHASES change.)

- [ ] **Step 3: Replace the phase header dot**

Find (around line 381):

```tsx
<div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: "var(--accent)" }} />
```

Replace with (using phase token):

```tsx
<div
  className="w-1.5 h-1.5 rounded-full shrink-0"
  style={{ background: `var(--phase-${phase.key})` }}
/>
```

- [ ] **Step 4: Replace priority badge colors**

Find (around lines 479–487):

```tsx
background: r.priority === "p0" ? "#FEE2E2" : r.priority === "p1" ? "#FFEDD5" : r.priority === "p2" ? "#FEF9C3" : "var(--bg-hover)",
color: r.priority === "p0" ? "#DC2626" : r.priority === "p1" ? "#C2410C" : r.priority === "p2" ? "#A16207" : "var(--text-secondary)",
```

Replace with:

```tsx
background: r.priority === "p0" ? "var(--priority-p0-bg)" : r.priority === "p1" ? "var(--priority-p1-bg)" : r.priority === "p2" ? "var(--priority-p2-bg)" : "var(--priority-p3-bg)",
color: r.priority === "p0" ? "var(--priority-p0-text)" : r.priority === "p1" ? "var(--priority-p1-text)" : r.priority === "p2" ? "var(--priority-p2-text)" : "var(--priority-p3-text)",
```

- [ ] **Step 5: Replace deadline badge colors**

Find (around lines 504–511):

```tsx
style={{
  fontSize: 10,
  fontWeight: 500,
  padding: "1px 5px",
  background: "#FEF3C7",
  color: "#B45309",
}}
```

Replace with:

```tsx
style={{
  fontSize: 10,
  fontWeight: 500,
  padding: "1px 5px",
  background: "var(--priority-p2-bg)",
  color: "var(--priority-p2-text)",
}}
```

- [ ] **Step 6: Replace stalled text color**

Find (around line 518):

```tsx
{isStalled(r) && (
  <span style={{ fontSize: 10, color: "#B45309" }}>stalled</span>
)}
```

Replace with:

```tsx
{isStalled(r) && (
  <span style={{ fontSize: 10, color: "var(--priority-p1-text)" }}>stalled</span>
)}
```

- [ ] **Step 7: Apply shadow-border to request rows instead of border**

Find the request row container (around line 437):

```tsx
border: `1px solid ${isFocused ? "var(--accent)" : "var(--border)"}`,
```

Replace with:

```tsx
boxShadow: isFocused ? "0 0 0 1.5px var(--accent)" : "var(--shadow-border)",
border: "none",
```

- [ ] **Step 8: Update phase section empty state border**

Find (around line 409):

```tsx
style={{ border: "1px dashed var(--border)" }}
```

This already uses a token — leave it as is.

- [ ] **Step 9: Update the phase header section background for alternation**

Find the phase section div (around line 375):

```tsx
<div key={phase.key}>
  {/* Phase header */}
```

Add a subtle background to phase section rows to apply Notion's warm alternation. Wrap the phase section content in:

```tsx
<div
  key={phase.key}
  className="rounded-lg px-3 py-2"
  style={{ background: "var(--bg-base)" }}
>
```

This stays as bg-base for now. The `--bg-section` token is available for future alternation (e.g., even/odd phases).

- [ ] **Step 10: Type check**

```bash
cd /Users/yashkaushal/Lane && npx tsc --noEmit
```

Expected: no errors. If there are type errors from the PHASES restructure (e.g., accessing removed properties like `phase.color`, `phase.borderColor`), search for those property names in the file and remove any remaining usages.

- [ ] **Step 11: Full build check**

```bash
cd /Users/yashkaushal/Lane && npm run build
```

Expected: Build succeeds with no errors.

- [ ] **Step 12: Commit**

```bash
git add components/requests/request-list.tsx
git commit -m "feat: migrate request-list.tsx — zero hardcoded values, phase/priority tokens"
```

---

## Task 6: Visual verification

- [ ] **Step 1: Start dev server**

```bash
cd /Users/yashkaushal/Lane && npm run dev
```

- [ ] **Step 2: Open the requests page and verify**

Check visually:
- Request rows have a subtle shadow instead of flat border — cards should look slightly elevated
- Priority badges (P0/P1/P2/P3) still show correct red/orange/yellow/gray colors
- Phase headers show colored dots in the correct phase color (amber/lavender/blue/sage)
- Focused row shows a 1.5px green outline
- Secondary text (metadata, labels) is slightly darker than before but still warm gray
- Tertiary text (timestamps, IDs) is readable — not washed out

- [ ] **Step 3: Check button states**

Navigate to any page with buttons. Verify:
- Primary button is forest green `#2E5339` with white text
- Hover state darkens to `#264830`
- Outline button has a subtle ring border, not a hard slate border
- Ghost button is transparent with warm gray text

- [ ] **Step 4: Check input fields**

Click into any input field and verify:
- Border is a visible warm gray (should pass visual 3:1 check)
- Focus state shows a green `#2E5339` border, no blue ring
- Placeholder text is readable warm gray

- [ ] **Step 5: Final commit if any fixes were needed**

```bash
git add -p
git commit -m "fix: visual verification fixes from token sweep"
```
