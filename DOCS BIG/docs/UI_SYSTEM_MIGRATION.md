# UI System Migration + Design System Architecture

## ROLE

You are a senior frontend architect.

You are responsible for transforming an inconsistent React + Tailwind SaaS codebase into a scalable, token-driven, shadcn-style design system using Base UI primitives (NOT Radix).

---

## CURRENT PROBLEM

- Mixed UI architecture:
  - Some shadcn-style components
  - Some raw HTML + Tailwind
- No consistent design tokens
- Duplication and inconsistency across UI

---

## GOAL

Create a fully standardized UI system with:

- Design tokens as the single source of truth
- Tailwind mapped to tokens
- Reusable UI components (/components/ui)
- Feature-based architecture
- No raw HTML duplication

---

## CONSTRAINTS

- DO NOT use Radix UI
- Use Base UI primitives for interactions
- Follow shadcn philosophy:
  - Copy-based components
  - No external UI lock-in
  - Fully customizable

---

## STEP 1: AUDIT

- Identify:
  - All raw HTML UI patterns
  - Existing reusable components
  - Duplicate UI patterns

- Output a list of required components:
  - Button, Input, Modal, Dropdown, Card, etc.

---

## STEP 2: DESIGN TOKENS (MANDATORY)

  Create /src/styles/tokens.ts

  Define:
  - Colors (primary, secondary, destructive, background, foreground)
  - Spacing scale
  - Border radius
  - Typography (if needed)

  RULES:
  - No hardcoded values anywhere else
  - Tokens must drive all styling

---

## STEP 3: TAILWIND CONFIG

  Update tailwind.config.ts:

  - Map all tokens into Tailwind theme
  - Ensure:
    - Colors come from tokens
    - Spacing comes from tokens
    - Radius comes from tokens

---

## STEP 4: BUILD UI COMPONENT SYSTEM

Create /components/ui

Components must include:

- Button
- Input
- Textarea
- Select
- Dialog (using Base UI)
- Dropdown (using Base UI)
- Card
- Badge
- Tabs
- Tooltip (using Base UI)

REQUIREMENTS:

- Use class-variance-authority (cva)
- Support:
  - Variants (primary, secondary, destructive, outline, ghost)
  - Sizes (sm, md, lg)
- No business logic inside components
- Fully reusable and composable

---

## STEP 5: REFACTOR EXISTING UI

- Replace ALL raw HTML UI with new components
- Remove duplicated Tailwind styles
- Ensure visual consistency across all screens

STRICT RULE:
- No inline Tailwind for core UI elements

---

## STEP 6: COMPLEX COMPONENTS

For advanced UI (multi-select, combobox, date picker):

- Build using Base UI primitives
- Follow composition patterns
- Ensure accessibility + keyboard navigation

---

## STEP 7: FOLDER STRUCTURE

Enforce:

/components/ui → design system primitives  
/components/shared → cross-feature reusable  
/components/layout → layout  
/features/* → feature modules  

---

## STEP 8: CLEANUP

- Remove unused components
- Remove duplicated styles
- Ensure clean imports and structure

---

## STEP 9: OUTPUT

- Show:
  - Component inventory
  - Token structure
  - Tailwind config
  - 3 before vs after refactors
  - 1 fully refactored page

---

## NON-NEGOTIABLE RULES

- No hardcoded colors or spacing
- No raw HTML for buttons, inputs, etc.
- No mixing multiple UI patterns
- Consistency over speed
- Composition over duplication

---

## MENTAL MODEL

You are not fixing UI.

You are building a design system inside a live product.

Every decision must improve:
- Consistency
- Scalability
- Developer experience
- Design integrity
