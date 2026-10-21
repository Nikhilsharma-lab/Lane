import { fn } from 'storybook/test';
import type * as API from '../outcome-actions';
export const readRequestOutcome = fn<typeof API.readRequestOutcome>();
export const changeRequestOutcome = fn<typeof API.changeRequestOutcome>();
export const createFollowUpRequest = fn<typeof API.createFollowUpRequest>();
