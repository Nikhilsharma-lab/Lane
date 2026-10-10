// Storybook-only module boundary. Never imports executable server/database code.
import { fn } from "storybook/test"
import type * as Actions from "../actions"

export const pickUpRequest = fn<typeof Actions.pickUpRequest>().mockName("pickUpRequest")
export const markDone = fn<typeof Actions.markDone>().mockName("markDone")
export const pickUpRequests = fn<typeof Actions.pickUpRequests>().mockName("pickUpRequests")
export const markDoneMany = fn<typeof Actions.markDoneMany>().mockName("markDoneMany")
export const undoMarkDone = fn<typeof Actions.undoMarkDone>().mockName("undoMarkDone")
export const setRequestPriority = fn<typeof Actions.setRequestPriority>().mockName("setRequestPriority")
export const addComment = fn<typeof Actions.addComment>().mockName("addComment")
export const getAttachmentDownloadUrl = fn<typeof Actions.getAttachmentDownloadUrl>().mockName("getAttachmentDownloadUrl")
