import { disableTestUser, closePool } from './e2e-utils';

export default async function globalTeardown() {
  await disableTestUser();
  await closePool();
}
