"use client";

import { useState } from "react";
import { Button } from "@/components/arc/button/button";
import styles from "./settings.module.css";

export function WorkspaceIdentifier({ value }: { value: string }) {
  const [status, setStatus] = useState("");
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setStatus("Workspace ID copied.");
    } catch {
      setStatus("Could not copy. Select the ID and copy it manually.");
    }
  }
  return <div className={styles.row}>
    <div><strong>Workspace ID</strong><p>Use this identifier when contacting support.</p><p className={styles.identifier}>{value}</p><p role="status">{status}</p></div>
    <Button variant="secondary" size="sm" onClick={copy}>Copy workspace ID</Button>
  </div>;
}
