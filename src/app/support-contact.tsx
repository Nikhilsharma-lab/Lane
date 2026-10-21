import frame from "./app-frame.module.css";

/** Lane's support address, the contact the published privacy policy names (decision 2026-10-21). */
export const SUPPORT_EMAIL = "uselaneapp@gmail.com";

/** The error frames' way to "let us know": one line under the actions, with the address written out. */
export function SupportContact() {
  return <p className={frame.contact}>If this keeps happening, email <a href={`mailto:${SUPPORT_EMAIL}`} className={frame.contactLink}>{SUPPORT_EMAIL}</a>.</p>;
}
