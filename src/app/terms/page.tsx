import type { Metadata } from "next";
import Link from "next/link";
import { LaneMark } from "@/components/auth/auth-shell";
import { SUPPORT_EMAIL } from "@/app/support-contact";
// One stylesheet for both legal pages, so Terms reads exactly like the Privacy policy.
import styles from "../privacy/privacy.module.css";

export const metadata: Metadata = {
  title: "Terms of service | Lane",
  description: "The terms for using Lane during its free, invite-only pilot.",
};

const contact = <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>;

export default function TermsPage() {
  return <main className={styles.page}>
    <Link href="/login" aria-label="Lane sign in"><LaneMark /></Link>
    <header><h1>Terms of service</h1><p>Effective 21 October 2026</p><p>The terms for using Lane during its free, invite-only pilot.</p></header>
<section><h2>1. About these terms</h2><p>These terms apply to your use of Lane at app.uselane.app. Lane is operated by Nikhil Sharma in India. “Lane”, “we” and “us” refer to Nikhil Sharma operating Lane. By creating an account or using Lane, you agree to these terms.</p><p>The <Link href="/privacy">Privacy policy</Link> explains how we handle personal information. If you have a question about these terms, email {contact}.</p></section>
<section><h2>2. Who may use Lane</h2><p>Lane is a free, invite-only pilot for teams that plan and track design work. You may use Lane if you are 18 or older, you use it for work, and you have been invited to the pilot or to a workspace in it.</p><p>If you create a workspace for a team or company, make sure you are allowed to use Lane for that team’s work.</p></section>
<section><h2>3. Accounts and workspaces</h2><p>Clerk handles sign-in, sessions, workspaces, memberships and invitations for Lane. Every workspace has administrators and members, and may have guests:</p><ul><li><strong>Administrators</strong> manage the workspace, invite people and remove them.</li><li><strong>Members</strong> see and work on the workspace’s Requests.</li><li><strong>Guests</strong> see and comment on only their own Requests.</li></ul><p>Your PM, Designer or Developer role is a label. It does not change what you can see or do.</p><p>Keep your sign-in details secure and do not share your account. If you think someone else is using it, email {contact}.</p></section>
<section><h2>4. Acceptable use</h2><p>Use Lane only for lawful work with your team. Do not:</p><ul><li>share content you do not have the right to share, or content that is unlawful, harmful or abusive;</li><li>put passwords, credentials or unnecessary sensitive personal information in Requests, comments or attachments;</li><li>try to reach a workspace, Request or file you have not been given access to, or get around Lane’s access controls or limits;</li><li>upload malware, or disrupt, overload or probe Lane or the services it relies on;</li><li>use automated tools to collect content from Lane, or use Lane to send spam.</li></ul></section>
<section><h2>5. The AI check in Intake</h2><p>Before a Request is saved, the Intake AI check reads its title and description and suggests whether it describes a problem, a solution or both. When a Request describes a solution, the check suggests a problem framing.</p><p>Its output is a suggestion. You review it and decide what to confirm, and you remain responsible for the Request you save. The check can be wrong, so read its suggestion before you confirm it. Section 4 of the <Link href="/privacy">Privacy policy</Link> explains what the check sends to Anthropic.</p></section>
<section><h2>6. Your content</h2><p>You and your workspace keep ownership of what you put in Lane: Requests, descriptions, impact information, links, comments and files.</p><p>You give us permission to host, store, copy, display and process that content only as needed to run Lane for your workspace. That includes showing it to the people your workspace gives access to, sending a Request’s title and description to the AI check, and keeping backup copies. This permission ends when the content is deleted, apart from the backup copies and records described in the Privacy policy.</p><p>Only add content you are entitled to share, and only share access with people who should see it.</p></section>
<section><h2>7. Availability during the pilot</h2><p>Lane is free during the pilot and does not accept payment. Using the pilot does not commit you or your team to a paid plan.</p><p>Because Lane is a pilot, features may change, pause or be removed, and Lane may sometimes be unavailable. We do not promise any level of availability. Keep your own copy of anything you cannot afford to lose.</p></section>
<section><h2>8. Suspension and termination</h2><p>You can stop using Lane at any time. To close your account, follow section 9.</p><p>We may suspend or end access to an account or a workspace if these terms are broken, to protect other people or the service, or when the pilot ends. Where practical, we tell the people affected before access stops.</p></section>
<section><h2>9. Deleting your account or workspace</h2><p>To delete your account or a whole workspace, email {contact}. The Retention and deletion section of the <Link href="/privacy">Privacy policy</Link> explains how requests are handled, what is removed, what stays with the workspace and how long backup copies last.</p></section>
<section><h2>10. Disclaimers</h2><p>Lane is provided as it is and as available. To the extent the law allows, we make no promises that Lane will be uninterrupted or free of errors, that the AI check’s suggestions are accurate, or that Lane suits a particular purpose.</p></section>
<section><h2>11. Limitation of liability</h2><p>To the extent the law allows, we are not liable for indirect or consequential losses, or for lost profits, revenue, data or goodwill, arising from your use of Lane.</p><p>To the extent the law allows, our total liability for any claim relating to Lane is limited to the amount you paid us for Lane in the 12 months before the claim. During the free pilot, that amount is nothing.</p><p>Nothing in these terms limits liability that the law does not allow us to limit.</p></section>
<section><h2>12. Changes to these terms</h2><p>We may update these terms as Lane changes. When we do, we update the effective date at the top of this page and tell you about material changes before they take effect.</p><p>If you keep using Lane after a change takes effect, the updated terms apply. If you do not agree to them, stop using Lane and ask us to delete your account.</p></section>
<section><h2>13. Governing law</h2><p>These terms are governed by the laws of India, and the courts of India have jurisdiction over any dispute about them.</p></section>
<section><h2>14. Contact</h2><p>For questions about these terms, email {contact}.</p></section>

    <footer><Link href="/login">Back to sign in</Link></footer>
  </main>;
}
