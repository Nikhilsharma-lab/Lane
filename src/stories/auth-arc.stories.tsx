import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";
import { expect, fn, userEvent, within } from "storybook/test";
import { LoginFrame, RecoveryFrame, SignupFrame } from "@/components/auth/auth-frames";
import { AuthHeaderLink } from "@/components/auth/auth-shell";
import { AuthHeaderSlot } from "@/components/auth/auth-header-slot";
import { AuthCardSkeleton } from "@/components/auth/auth-card-skeleton";
import { ClerkUnavailable } from "@/components/auth/clerk-unavailable";
import { PasswordRecoveryView, type PasswordRecoveryViewProps } from "@/components/auth/password-recovery-view";
import MembersLoading from "@/app/(app)/settings/members/loading";

const meta = { title: "Auth/Arc flows", parameters: { layout: "fullscreen", docs: { description: { component: "Actual Lane presentation components using the official Arc input, password field, button, alert and skeleton. These stories make no Clerk network calls and do not claim authentication, invitation acceptance, or role persistence succeeded." } } } } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

const submit = fn(async () => {});
function RecoveryPreview(props: Partial<PasswordRecoveryViewProps>) {
  const [email, setEmail] = useState("preview@example.com");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  return <RecoveryFrame>
    <PasswordRecoveryView step="request" email={email} code={code} password={password} error={null} notice={null}
      sending={false} pending={false} isLoaded resendIn={0} setEmail={setEmail} setCode={setCode} setPassword={setPassword}
      performAction={submit} onChangeEmail={() => {}} {...props} />
  </RecoveryFrame>;
}

export const RequestResetCode: Story = { render: () => <RecoveryPreview />,
  play: async ({ canvasElement }) => { const c = within(canvasElement); await expect(c.getByRole("textbox", { name: "Email address" })).toHaveAttribute("type", "email"); await expect(c.getByRole("link", { name: "Sign in" })).toBeVisible(); } };
export const VerifyResetCode: Story = { render: () => <RecoveryPreview step="code" />,
  play: async ({ canvasElement }) => { const c = within(canvasElement); const input = c.getByLabelText("New password", { exact: true }); await userEvent.type(input, "preview-password"); await userEvent.click(c.getByRole("button", { name: "Show password" })); await expect(input).toHaveAttribute("type", "text"); await userEvent.click(c.getByRole("button", { name: "Hide password" })); await expect(input).toHaveAttribute("type", "password"); } };
export const ResendCooldown: Story = { render: () => <RecoveryPreview step="code" resendIn={24} notice="A reset code has been sent. Use the most recent email." /> };
export const RecoveryError: Story = { render: () => <RecoveryPreview step="code" error="Could not complete the password reset. Try again." /> };
export const RecoveryPending: Story = { render: () => <RecoveryPreview pending sending /> };
export const FinishSignIn: Story = { render: () => <RecoveryPreview step="activate" error="Your password was updated, but sign-in did not finish. Continue to try again." /> };
export const ContinueVerification: Story = { render: () => <RecoveryPreview step="continue" /> };

// The onboarding role step's stories render the real RoleForm: src/stories/onboarding.stories.tsx.
// Plan item 2.11: the routes' loading states and Clerk's fallback. The real routes pass LoginResetLink,
// which reads the Clerk session; these stories pass the two states it renders.
const resetLink = (concealed: boolean) => <AuthHeaderSlot concealed={concealed}><AuthHeaderLink prompt="Forgot your password?" href="/forgot-password" label="Reset it" /></AuthHeaderSlot>;
export const LoginLoading: Story = { render: () => <LoginFrame headerAction={resetLink(false)}><AuthCardSkeleton label="Loading sign in" /></LoginFrame>,
  play: async ({ canvasElement }) => { const c = within(canvasElement); await expect(c.getByRole("status", { name: "Loading sign in" })).toBeInTheDocument(); await expect(c.getAllByRole("status")).toHaveLength(1); await expect(c.getByRole("link", { name: "Reset it" })).toBeVisible(); } };
export const LoginDuringSessionTask: Story = { render: () => <LoginFrame headerAction={resetLink(true)}><AuthCardSkeleton label="Loading workspaces" fields={0} social={false} /></LoginFrame>,
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await expect(c.queryByRole("link", { name: "Reset it" })).toBeNull();
    // The hidden link keeps its box, so the header does not move when it returns.
    const kept = canvasElement.querySelector("[data-concealed]");
    await expect(kept?.getBoundingClientRect().height).toBeGreaterThan(0);
    await userEvent.tab();
    await expect(document.activeElement).toBe(c.getByRole("link", { name: "Lane sign in" }));
    await userEvent.tab();
    await expect(document.activeElement?.closest("[data-concealed]")).toBeNull();
  } };
export const SignupLoading: Story = { render: () => <SignupFrame><AuthCardSkeleton label="Loading account creation" fields={2} /></SignupFrame> };
export const ResetTaskLoading: Story = { render: () => <RecoveryFrame><AuthCardSkeleton label="Loading password reset" fields={2} social={false} /></RecoveryFrame> };
export const MembersLoadingState: Story = { render: () => <main><MembersLoading /></main> };

// Decision 2026-10-21 (critique 2.11): Clerk reported it could not load, so the skeleton gives way to a way out.
const reload = fn();
export const ClerkUnavailableOnLogin: Story = {
  render: () => <LoginFrame headerAction={resetLink(false)}><ClerkUnavailable title="Sign in is unavailable right now" onReload={reload} /></LoginFrame>,
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    const alert = c.getByRole("alert");
    await expect(within(alert).getByRole("heading", { level: 1, name: "Sign in is unavailable right now" })).toBeVisible();
    await expect(alert).toHaveTextContent("Check your connection, or turn off blockers for this site, then reload.");
    await expect(c.queryByRole("status", { name: /^Loading/ })).not.toBeInTheDocument();
    await userEvent.click(within(alert).getByRole("button", { name: "Reload" }));
    await expect(reload).toHaveBeenCalledOnce();
  },
};
export const ClerkUnavailableOnSignup: Story = { render: () => <SignupFrame><ClerkUnavailable title="Sign up is unavailable right now" onReload={reload} /></SignupFrame> };
