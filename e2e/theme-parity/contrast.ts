/**
 * WCAG contrast between two painted colours, as the parity capture writes them
 * (`oklab(L a b / alpha)`, see capture.ts). A see-through text colour is laid
 * over its background first. Used by the Part 2 dark-mode assertions (#93).
 * The maths is Lane's shared colour module.
 */
export { contrastRatio } from "../../scripts/design-system/colour.mjs";
