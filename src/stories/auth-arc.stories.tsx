import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";
import { expect, fn, userEvent, within } from "storybook/test";
import { AuthHeaderLink, AuthShell } from "@/components/auth/auth-shell";
import { AuthFormCard } from "@/components/auth/auth-form-card";
import { AuthAction } from "@/components/auth/auth-action";
import { AuthLoading } from "@/components/auth/auth-loading";
import { PasswordRecoveryView, type PasswordRecoveryViewProps } from "@/components/auth/password-recovery-view";
import { RoleSelection, type FunctionalRole } from "@/components/auth/role-selection";
import { OnboardingChrome } from "@/components/auth/onboarding-chrome";
import MembersLoading from "@/app/(app)/settings/members/loading";

const meta = { title: "Auth/Arc flows", parameters: { layout: "fullscreen", docs: { description: { component: "Actual Lane presentation components using the official Arc input, password field, radio group, button, alert and skeleton. These stories make no Clerk network calls and do not claim authentication, invitation acceptance, or role persistence succeeded." } } } } satisfies Meta;
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

function RolePreview({ pending = false, error }: { pending?: boolean; error?: string }) {
  const [role, setRole] = useState<FunctionalRole | null>(null);
  return <OnboardingChrome current={2} total={2}><AuthFormCard title="How do you work?" description="Choose your role. You can change it in Profile settings. It does not change what you can see or do.">
    <div className="grid gap-6"><RoleSelection value={role} onValueChange={setRole} disabled={pending} invalid={Boolean(error)} />
      {error && <p role="alert" className="text-sm text-[var(--danger)]">{error}</p>}
      <AuthAction loading={pending} loadingLabel="Saving role…">Continue</AuthAction>
    </div>
  </AuthFormCard></OnboardingChrome>;
}
export const ChooseRole: Story = { render: () => <RolePreview />,
  play: async ({ canvasElement }) => { const c = within(canvasElement); const role = c.getByRole("radio", { name: /^Designer/ }); await userEvent.click(role); await expect(role).toBeChecked(); } };
export const RoleSavePending: Story = { render: () => <RolePreview pending /> };
export const RoleSaveFailure: Story = { render: () => <RolePreview error="Your role selection is still here. Check your connection and try again." /> };
export const SignupLoading: Story = { render: () => <AuthShell><AuthLoading label="Loading account creation" /></AuthShell> };
export const MembersLoadingState: Story = { render: () => <MembersLoading /> };
