import { fn } from "storybook/test"
import type * as Actions from "../actions"

// Browser preview boundary: no Clerk sessions or database writes.
export const getNotifications = fn<typeof Actions.getNotifications>()
export const getUnreadCount = fn<typeof Actions.getUnreadCount>()
export const markNotificationRead = fn<typeof Actions.markNotificationRead>()
export const markNotificationUnread = fn<typeof Actions.markNotificationUnread>()
export const markAllNotificationsRead = fn<typeof Actions.markAllNotificationsRead>()
