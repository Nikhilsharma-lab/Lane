import { fn } from "storybook/test";
import type { listProjects as ListProjects, createProject as CreateProject } from "../project-actions";

// Storybook boundary: project selection never accesses real workspace data.
export const listProjects = fn<typeof ListProjects>().mockName("listProjects");
export const createProject = fn<typeof CreateProject>().mockName("createProject");
