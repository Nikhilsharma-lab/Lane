"use client";

import { useState } from "react";
import { Button } from "@/components/arc/button/button";
import { SettingsRow } from "./settings-group";
import styles from "./settings.module.css";

export function WorkspaceIdentifier({ value }: { value: string }) {
  const [status, setStatus] = useState("");
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setStatus("Workspace ID copied.");
    } catch {
      setStatus("Couldn’t copy. Select the ID and copy it manually.");
    }
  }
  return <SettingsRow label="Workspace ID" hint="Use this identifier when contacting support."
    control={<Button variant="secondary" size="sm" onClick={copy}>Copy workspace ID</Button>}>
    <p className={`${styles.rowHint} ${styles.identifier}`}>{value}</p><p role="status" className={`${styles.rowHint} ${styles.feedback}`}>{status}</p>
  </SettingsRow>;
}
