import { fn } from "storybook/test";
import type { saveRequestEdits as Save } from "../edit-actions";
export const saveRequestEdits = fn< typeof Save >().mockName("saveRequestEdits");
