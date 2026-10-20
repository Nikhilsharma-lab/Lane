import { fn } from "storybook/test";
import type { listLabels as List, createLabel as Create } from "../label-actions";
import { DEFAULT_LABELS } from "@/lib/request-labels";
export const listLabels=fn<typeof List>().mockResolvedValue({success:true,labels:DEFAULT_LABELS,canCreate:true});
export const createLabel=fn<typeof Create>().mockName("createLabel");
