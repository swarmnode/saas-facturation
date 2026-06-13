import { ensureTestUser, closePool } from './e2e-utils';

export default async function globalSetup() {
  await ensureTestUser();
  await closePool();
}
