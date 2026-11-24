import { test as setup } from "@playwright/test";
import { proveAppAcceptsTestSessions } from "./helpers/app-auth-proof";

setup("the app accepts this run's test sessions", async () => {
  await proveAppAcceptsTestSessions();
});
