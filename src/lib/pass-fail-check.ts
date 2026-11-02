export const PASS_FAIL_RESULT_MAX = 120;
export const PASS_FAIL_DETAIL_MAX = 1000;
export type PassFailDetails = { result: string; steps: string; pass: string };

export const PASS_FAIL_EXAMPLES = {
  keyboard: { result: 'Complete the flow using only a keyboard', steps: 'Use Tab, Shift+Tab, Enter and Space to complete the flow described in this Request.', pass: 'Every control can be reached, the focused control is visible, and the flow can be completed without a mouse or touch.' },
  required: { result: 'Show people which required fields are missing', steps: 'Leave each required field empty in turn and try to submit the form described in this Request.', pass: 'The form cannot be submitted with missing required answers. Each missing field is identified. Valid answers allow submission.' },
  recovery: { result: 'Keep entered details when the connection fails', steps: 'Enter details, disconnect the internet and try to submit. Reconnect, then try again.', pass: 'The entered details are still there, an error is shown, and trying again completes the action once without a duplicate.' },
} satisfies Record<string, PassFailDetails>;

export function passFailDetails(primary: { check: string; checkDetails?: PassFailDetails }): PassFailDetails {
  if (primary.check === 'custom' && primary.checkDetails) return primary.checkDetails;
  if (Object.hasOwn(PASS_FAIL_EXAMPLES, primary.check)) return PASS_FAIL_EXAMPLES[primary.check as keyof typeof PASS_FAIL_EXAMPLES];
  return { result: 'Pass/fail check', steps: '', pass: '' };
}
