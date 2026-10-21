import { fn } from "storybook/test";
import type * as API from "../agreement-actions";
export const readReviews = fn<typeof API.readReviews>();
export const loadReviewerPeople = fn<typeof API.loadReviewerPeople>();
export const addReviewers = fn<typeof API.addReviewers>();
export const removeReviewer = fn<typeof API.removeReviewer>();
export const answerReview = fn<typeof API.answerReview>();
