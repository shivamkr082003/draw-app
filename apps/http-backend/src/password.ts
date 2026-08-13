import bcrypt from "bcryptjs";

const SALT_ROUNDS = 10;

/** Internal guest placeholder — not a real user credential. */
export const GUEST_PASSWORD_SENTINEL = "guest_password_not_used";

const BCRYPT_HASH_PATTERN = /^\$2[aby]\$\d{2}\$/;

export function isBcryptHash(value: string): boolean {
  return BCRYPT_HASH_PATTERN.test(value);
}

export async function hashPassword(plaintext: string): Promise<string> {
  return bcrypt.hash(plaintext, SALT_ROUNDS);
}

export type PasswordVerificationResult = {
  valid: boolean;
  /** Set when a legacy plaintext password matched and should be replaced with this hash. */
  upgradedHash?: string;
};

/**
 * Verify a password against the stored value.
 * Bcrypt hashes are compared with bcrypt.compare.
 * Legacy plaintext rows (local/dev only) upgrade on successful login once.
 */
export async function verifyPassword(
  plaintext: string,
  stored: string
): Promise<PasswordVerificationResult> {
  if (isBcryptHash(stored)) {
    const valid = await bcrypt.compare(plaintext, stored);
    return { valid };
  }

  // Guest/system placeholders must never authenticate via email/password.
  if (stored === GUEST_PASSWORD_SENTINEL) {
    return { valid: false };
  }

  // One-time migration for pre-bcrypt local users — do not persist plaintext.
  if (stored === plaintext) {
    return { valid: true, upgradedHash: await hashPassword(plaintext) };
  }

  return { valid: false };
}
