"use client"

import dynamic from "next/dynamic"

/**
 * #219: the saved view control's code (its menu, dialog and name field) loads after the Requests list, as the first
 * run's guide does (#217), so the list's first load stays within its budget. The server still renders it.
 */
export const SavedViewMenuLoader = dynamic(() => import("./saved-view-menu").then(module => module.SavedViewMenu))
