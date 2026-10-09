import { fn } from "storybook/test";
import type {
  runTriage as TriageAction,
  saveRequest as SaveAction,
} from "../actions";

// Storybook boundary only: importing the production server module would load
// Clerk, Postgres and AI SDK code in the browser.
export const runTriage = fn<typeof TriageAction>().mockName("runTriage");
export const saveRequest = fn<typeof SaveAction>().mockName("saveRequest");
