import { fn } from "storybook/test"
import type * as Actions from "../actions"

// Browser preview boundary: no Clerk sessions or profile writes.
export const saveOnboardingRole = fn<typeof Actions.saveOnboardingRole>()
