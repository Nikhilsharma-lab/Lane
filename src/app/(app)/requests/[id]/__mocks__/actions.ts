// Storybook-only module boundary. Never imports executable server/database code.
import { fn } from "storybook/test"
import type * as Actions from "../actions"

export const pickUpRequest = fn<typeof Actions.pickUpRequest>().mockName("pickUpRequest")
export const markDone = fn<typeof Actions.markDone>().mockName("markDone")
export const addComment = fn<typeof Actions.addComment>().mockName("addComment")
export const getAttachmentDownloadUrl = fn<typeof Actions.getAttachmentDownloadUrl>().mockName("getAttachmentDownloadUrl")
