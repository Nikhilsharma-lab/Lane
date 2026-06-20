import { createServiceClient } from "../../src/lib/supabase/admin";

const TEST_EMAIL_DOMAIN = "lane-e2e-test.local";

let serviceClient: ReturnType<typeof createServiceClient> | null = null;

function getAdmin() {
  if (!serviceClient) serviceClient = createServiceClient();
  return serviceClient;
}

export async function createTestUser(
  label: string,
  password = "Test1234!"
): Promise<{ id: string; email: string; password: string }> {
  const email = `${label}-${Date.now()}@${TEST_EMAIL_DOMAIN}`;
  const admin = getAdmin();

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (error || !data.user) {
    throw new Error(`[e2e] createTestUser failed: ${error?.message}`);
  }

  return { id: data.user.id, email, password };
}

export async function deleteTestUser(id: string): Promise<void> {
  const admin = getAdmin();
  const { error } = await admin.auth.admin.deleteUser(id);
  if (error) {
    console.warn(`[e2e] deleteTestUser(${id}) failed: ${error.message}`);
  }
}

export async function cleanupTestUsers(): Promise<void> {
  const admin = getAdmin();
  const { data } = await admin.auth.admin.listUsers({ perPage: 1000 });
  if (!data?.users) return;

  const testUsers = data.users.filter((u) =>
    u.email?.endsWith(`@${TEST_EMAIL_DOMAIN}`)
  );

  for (const user of testUsers) {
    await admin.auth.admin.deleteUser(user.id);
  }

  if (testUsers.length > 0) {
    console.log(`[e2e] cleaned up ${testUsers.length} test user(s)`);
  }
}
