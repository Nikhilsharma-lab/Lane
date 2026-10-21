import { fn } from 'storybook/test';
import type * as API from '../release-actions';
export const readRequestRelease = fn<typeof API.readRequestRelease>();
export const changeRequestRelease = fn<typeof API.changeRequestRelease>();
