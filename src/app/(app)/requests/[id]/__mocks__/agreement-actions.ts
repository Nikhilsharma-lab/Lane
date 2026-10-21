import { fn } from "storybook/test";
import type * as API from "../agreement-actions";
export const readAgreement = fn<typeof API.readAgreement>();
export const loadAgreementPeople = fn<typeof API.loadAgreementPeople>();
export const prepareAgreement = fn<typeof API.prepareAgreement>();
export const submitAgreement = fn<typeof API.submitAgreement>();
export const decideAgreement = fn<typeof API.decideAgreement>();
export const resolveAgreementConcern = fn<typeof API.resolveAgreementConcern>();
export const replaceAgreementParticipant =
  fn<typeof API.replaceAgreementParticipant>();
export const addAgreementCorrection = fn<typeof API.addAgreementCorrection>();
export const createAgreementReplacement =
  fn<typeof API.createAgreementReplacement>();
export const confirmRequestSuperseded =
  fn<typeof API.confirmRequestSuperseded>();
