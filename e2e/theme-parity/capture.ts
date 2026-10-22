import type { Page } from "@playwright/test";

/**
 * What one page paints in one mode: the resolved theme names on the page root
 * (and where the primary navigation overrides them), plus the computed look of
 * a fixed set of representative elements. Every colour is written as
 * `oklab(L a b / alpha)` so a colour written another way (hex, rgb, oklch,
 * color-mix) still compares as the same colour.
 */
export type PaintedTheme = {
  names: Record<string, string>;
  navigationNames: Record<string, string> | null;
  elements: Record<string, Record<string, string> | null>;
};

/** Representative elements. The first visible match is read; none is recorded as null. */
export const REPRESENTATIVE_ELEMENTS: Record<string, string> = {
  page: "html",
  body: "body",
  heading: "h1",
  subheading: "h2",
  paragraph: "main p",
  link: "main a",
  button: "main button",
  submit: 'button[type="submit"]',
  // Not aria-hidden inputs: Radix renders an invisible one beside each row checkbox in the server HTML and
  // drops it on hydration, so whether it is read would depend on timing. It never paints anything.
  input: 'input:not([type="hidden"]):not([aria-hidden="true"])',
  textarea: "textarea",
  label: "label",
  navigation: 'nav[aria-label="Primary navigation"]',
  navigationLink: 'nav[aria-label="Primary navigation"] a',
  pageStrip: '[data-slot="page-strip"]',
  requestRow: '[data-slot="row"]',
  identityMark: '[data-slot="identity-mark"]',
  clerkCard: ".cl-card",
  clerkPrimaryButton: ".cl-formButtonPrimary",
  clerkFooterLink: ".cl-footerActionLink",
};

export const PAINTED_PROPERTIES = [
  "color",
  "background-color",
  "background-image",
  "border-top-color",
  "border-top-width",
  "border-top-left-radius",
  "box-shadow",
  "font-family",
  "font-size",
  "font-weight",
  "line-height",
  "letter-spacing",
] as const;

export async function capturePaintedTheme(
  page: Page,
  names: readonly string[]
): Promise<PaintedTheme> {
  return page.evaluate(
    ({ names, elements, properties }) => {
      const COLOUR =
        /\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color|color-mix)\((?:[^()]|\((?:[^()]|\([^()]*\))*\))*\)/g;
      const round = (text: string) =>
        text
          .replace(/-?\d*\.\d+(?:e-?\d+)?/g, (n) =>
            String(Number(Number(n).toFixed(4)) || 0)
          )
          .replace(/\s+/g, " ")
          .trim();

      const probe = document.createElement("div");
      probe.style.cssText =
        "position:absolute;visibility:hidden;pointer-events:none;font-size:16px;";
      document.body.append(probe);

      const asColour = (value: string) => {
        probe.removeAttribute("style");
        probe.style.setProperty("color", `oklab(from ${value} l a b / alpha)`);
        const written = probe.style.getPropertyValue("color");
        return written ? round(getComputedStyle(probe).color) : null;
      };
      const coloursIn = (text: string) =>
        text.replace(COLOUR, (token) => asColour(token) ?? token);

      // A custom property's value is read as what it paints: a colour, a
      // length, a shadow, an image, a duration or an easing. Anything else
      // (weights, opacities, font stacks, keywords) is compared as written.
      const KINDS = [
        "padding",
        "box-shadow",
        "background-image",
        "transition-duration",
        "transition-timing-function",
      ];
      const resolve = (raw: string) => {
        const value = raw.trim();
        if (!value) return "";
        if (CSS.supports("color", value)) return asColour(value) ?? round(value);
        for (const property of KINDS) {
          if (!CSS.supports(property, value)) continue;
          probe.removeAttribute("style");
          probe.style.setProperty(property, value);
          return round(coloursIn(getComputedStyle(probe).getPropertyValue(property)));
        }
        return round(value);
      };
      const namesOn = (element: Element) => {
        const style = getComputedStyle(element);
        return Object.fromEntries(
          names.map((name) => [name, resolve(style.getPropertyValue(name))])
        );
      };

      const visible = (element: Element) =>
        element.getClientRects().length > 0 &&
        getComputedStyle(element).visibility !== "hidden";
      const first = (selector: string) =>
        Array.from(document.querySelectorAll(selector)).find(visible) ?? null;

      const rootNames = namesOn(document.documentElement);
      const navigation = first('nav[aria-label="Primary navigation"]');
      const navigationNames = navigation
        ? Object.fromEntries(
            Object.entries(namesOn(navigation)).filter(
              ([name, value]) => value !== rootNames[name]
            )
          )
        : null;

      const painted = Object.fromEntries(
        Object.entries(elements).map(([key, selector]) => {
          const element = first(selector);
          if (!element) return [key, null];
          const style = getComputedStyle(element);
          return [
            key,
            Object.fromEntries(
              properties.map((property) => [
                property,
                round(coloursIn(style.getPropertyValue(property))),
              ])
            ),
          ];
        })
      );

      probe.remove();
      return { names: rootNames, navigationNames, elements: painted };
    },
    {
      names: [...names],
      elements: REPRESENTATIVE_ELEMENTS,
      properties: [...PAINTED_PROPERTIES],
    }
  );
}
