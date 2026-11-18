import { TYPING } from "@/lib/keyboard-guards";
import { EARLY_SEARCH } from "./settings-early-search-flag";

const flag = JSON.stringify(EARLY_SEARCH);
// Under the shortcut's own guards (opensSettingsSearch, isTypingTarget): no modifier, not while typing in a field.
const SCRIPT = `(()=>{const w=window,k=${flag};if(k in w)return;w[k]=false;addEventListener("keydown",e=>{const t=e.target;`
  + `if(w[k]===null||e.key!=="/"||e.metaKey||e.ctrlKey||e.altKey||e.repeat||e.isComposing||t instanceof Element&&(t.closest(${JSON.stringify(TYPING)})||t.isContentEditable))return;`
  + `e.preventDefault();w[k]=true})})()`;

/**
 * #288 (D20): "/" pressed while Settings is still loading its code opens search once it has. This inline script runs as
 * the page's HTML arrives (it is server markup only, so no first-load JavaScript grows): it notes the press and keeps
 * "/" out of the page, and Settings opens search when it mounts (`takeEarlySearch`). Rendered by the Settings pages
 * and their loading frame; the first copy to run is the one that listens.
 */
export function SettingsEarlySearch() {
  return <script dangerouslySetInnerHTML={{ __html: SCRIPT }} />;
}
