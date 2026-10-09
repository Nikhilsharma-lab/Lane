import { fn } from "storybook/test";
import type {
  discardAttachmentUpload as DiscardAction,
  finalizeAttachmentUpload as FinalizeAction,
  prepareAttachmentUpload as PrepareAction,
} from "../attachment-actions";

export const discardAttachmentUpload = fn<typeof DiscardAction>().mockName(
  "discardAttachmentUpload",
);
export const finalizeAttachmentUpload = fn<typeof FinalizeAction>().mockName(
  "finalizeAttachmentUpload",
);
export const prepareAttachmentUpload = fn<typeof PrepareAction>().mockName(
  "prepareAttachmentUpload",
);
