import { STORAGE_KEYS } from '@/utils/constants';

/**
 * Returns a stable per-device owner id, generated once and persisted in
 * localStorage. Used as the `x-owner-id` header for the asset API (minimal
 * access control for the personal-scale MVP).
 */
export function getDeviceToken(): string {
  const existing = localStorage.getItem(STORAGE_KEYS.DEVICE_TOKEN);
  if (existing) return existing;
  const token = crypto.randomUUID();
  localStorage.setItem(STORAGE_KEYS.DEVICE_TOKEN, token);
  return token;
}
