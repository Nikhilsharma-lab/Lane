import { ChevronDown } from "lucide-react";
import type { WorkspacePermission } from "@/lib/auth-guard";
import { ROLE_GUIDE, unavailableRolesNote, WORKSPACE_ROLES } from "@/lib/member-role-rules";
import { ROLE_NAMES } from "@/lib/role-rules";
import { SettingsGroup } from "./settings-group";
import styles from "./settings.module.css";
import members from "./members.module.css";

/**
 * #288 (#325, accepted design A): "What each role can do", read-only and folded at the bottom of Members. The roles
 * and every answer come from the shared role rules (member-role-rules.ts), so the guide follows them when roles change.
 * A native fold like Billing's "How Free Requests work" (#287), so one decision covers both. The table scrolls inside
 * its own region on a phone, its first column staying put.
 */
export function RoleGuide({ offered }: { offered: readonly WorkspacePermission[] }) {
  const unavailable = unavailableRolesNote(offered);
  return <SettingsGroup as="div">
    <details className={styles.fold}>
      <summary><span>What each role can do</span><ChevronDown data-icon-size="sm" aria-hidden="true" /></summary>
      <div className={members.roleGuide}>
        <div className={members.roleTableScroll} role="region" aria-label="What each role can do" tabIndex={0}>
          <table className={members.roleTable}>
            <thead><tr><th scope="col">Permission</th>{WORKSPACE_ROLES.map(role => <th key={role} scope="col">{ROLE_NAMES[role]}</th>)}</tr></thead>
            <tbody>{ROLE_GUIDE.map(row => <tr key={row.label}><th scope="row">{row.label}</th>{WORKSPACE_ROLES.map(role => <td key={role}>{row.answer(role)}</td>)}</tr>)}</tbody>
          </table>
        </div>
        {unavailable && <p>{unavailable} They’re shown here for reference.</p>}
        <p>What someone can do on a Request also depends on its status and their part in it. PM, Designer and Developer are profile labels; they don’t change access.</p>
      </div>
    </details>
  </SettingsGroup>;
}
