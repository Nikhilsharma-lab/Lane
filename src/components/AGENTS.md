# Lane component rules

- Inspect Plane's equivalent frontend before implementation: IA, composition, interaction, states, responsive, and keyboard behaviour.
- Reuse `src/components/ui` before creating a primitive; search the official shadcn registry when the component is missing.
- Lane uses shadcn `base-nova`, Base UI APIs and `render` composition, not assumed Radix APIs.
- Read local component source before use or modification. Diff the official registry first; never overwrite Lane-owned source blindly.
- Use semantic Tailwind tokens from `globals.css`, preserve `DESIGN.md`, and avoid arbitrary visual values.
- Verify accessible names, focus, keyboard operation, reduced motion, responsive behaviour, and all relevant states.
