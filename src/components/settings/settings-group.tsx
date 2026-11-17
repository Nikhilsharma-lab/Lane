import type { HTMLAttributes, ReactNode } from "react";
import styles from "./settings.module.css";

const cx = (...names: (string | false | undefined)[]) => names.filter(Boolean).join(" ");

/**
 * #287 (D23, D31): one bordered row group in a Settings section, following the Arc Pro `settings-page` block's
 * Group on Lane tokens. An optional small label (and a line under it), then the rows and any content under them,
 * each set apart by a hairline. There is no footer: what a footer said is a row's hint, or it is gone.
 */
export function SettingsGroup({ label, labelId, description, children, className, as: Tag = "section", ...props }: {
  /** The small group label, smaller than the section heading (with a count beside it, for a list). */
  label?: ReactNode;
  /** The label's id: it names the group, or a form around it. */
  labelId?: string;
  /** A line under the label, for what the whole group is about. */
  description?: ReactNode;
  children: ReactNode;
  /** `div` inside a form the label already names, so the page doesn't get two landmarks with one name. */
  as?: "section" | "div";
} & Omit<HTMLAttributes<HTMLElement>, "children">) {
  return <Tag {...props} className={cx(styles.group, className)} aria-labelledby={Tag === "section" && label && labelId ? labelId : props["aria-labelledby"]}>
    {(label || description) && <header className={styles.groupHead}>
      {label && <h3 id={labelId}>{label}</h3>}
      {description && <p>{description}</p>}
    </header>}
    <div className={styles.groupBox}>{children}</div>
  </Tag>;
}

/**
 * One row of a group: its label and hint on the left, its control (a button, a select, or a value) on the right.
 * `leading` sits before the label (an avatar). `children` sit under the hint. With `id`, search can land on the row.
 */
export function SettingsRow({ label, hint, control, leading, children, id, as: Tag = "div", className }: {
  label: ReactNode;
  hint?: ReactNode;
  control?: ReactNode;
  leading?: ReactNode;
  children?: ReactNode;
  id?: string;
  /** `li` inside a `SettingsRowList`. */
  as?: "div" | "li";
  className?: string;
}) {
  return <Tag id={id} tabIndex={id ? -1 : undefined} className={cx(styles.groupRow, !!leading && styles.groupRowLeading, className)}>
    {leading}
    <div className={styles.rowText}>
      <strong className={styles.rowLabel}>{label}</strong>
      {hint && <p className={styles.rowHint}>{hint}</p>}
      {children}
    </div>
    {control !== undefined && control !== null && control !== false && <div className={styles.rowControl}>{control}</div>}
  </Tag>;
}

/** A list of rows (people, invitations, invoices), named for assistive technology. Its rows are `SettingsRow as="li"`. */
export function SettingsRowList({ label, children }: { label: string; children: ReactNode }) {
  return <ul className={styles.groupList} aria-label={label}>{children}</ul>;
}

/** Content under the rows: alerts, forms, lists and longer text, padded like a row. */
export function SettingsBlock({ children, className, ...props }: { children: ReactNode } & HTMLAttributes<HTMLDivElement>) {
  return <div {...props} className={cx(styles.groupBlock, className)}>{children}</div>;
}
