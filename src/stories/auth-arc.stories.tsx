import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";
import { expect, fn, userEvent, within } from "storybook/test";
import { AuthHeaderLink, AuthShell } from "@/components/auth/auth-shell";
import { AuthLoading } from "@/components/auth/auth-loading";
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
  return <AuthShell headerAction={<AuthHeaderLink prompt="Remembered it?" href="/login" label="Sign in" />}>
    <PasswordRecoveryView step="request" email={email} code={code} password={password} error={null} notice={null}
      sending={false} pending={false} isLoaded resendIn={0} setEmail={setEmail} setCode={setCode} setPassword={setPassword}
      performAction={submit} onChangeEmail={() => {}} {...props} />
  </AuthShell>;
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
export const SignupLoading: Story = { render: () => <AuthShell><AuthLoading label="Loading account creation" /></AuthShell> };
export const MembersLoadingState: Story = { render: () => <MembersLoading /> };
