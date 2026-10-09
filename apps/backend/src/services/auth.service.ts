import crypto from 'crypto';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { queryOne, execute } from '@/db/connection.js';
import { config } from '@/config/env.js';
import { User } from '@/types/index.js';
import logger from '@/utils/logger.js';

// 12 rounds is the current sensible floor for bcrypt on server hardware; 10
// is fast enough to matter if a hash dump ever leaks.
const SALT_ROUNDS = 12;
const REFRESH_TOKEN_TTL_DAYS = parseInt(process.env.JWT_REFRESH_TTL_DAYS || '7', 10);
const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;

/**
 * Auth failures are deliberately indistinguishable to the caller. Returning
 * 'User not found' vs 'Invalid password' (the previous behavior) let anyone
 * enumerate which email addresses have accounts.
 */
export class InvalidCredentialsError extends Error {
  constructor() {
    super('Invalid email or password');
    this.name = 'InvalidCredentialsError';
  }
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/** Refresh tokens are stored as SHA-256 digests, never in plaintext. */
function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function signAccessToken(userId: string, email: string): string {
  // config.jwt.expiresIn comes from process.env (plain `string`), but
  // @types/jsonwebtoken's SignOptions.expiresIn wants the branded
  // `StringValue` type from `ms` — the runtime value is always a valid
  // ms-style string, backed by the '15m'/'7d' defaults in config/env.ts.
  return jwt.sign({ userId, email }, config.jwt.secret, {
    expiresIn: config.jwt.expiresIn as jwt.SignOptions['expiresIn'],
  });
}

/**
 * Issue a refresh token and persist its digest so it can be revoked. The
 * previous implementation was stateless: logout invalidated nothing and a
 * stolen refresh token stayed valid for its full 7 days with no recourse.
 */
async function issueRefreshToken(userId: string, email: string): Promise<string> {
  const jti = uuidv4();
  const token = jwt.sign({ userId, email, jti }, config.jwt.refreshSecret, {
    expiresIn: config.jwt.refreshExpiresIn as jwt.SignOptions['expiresIn'],
  });

  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);

  await execute(
    `INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at)
     VALUES ($1, $2, $3, $4)`,
    [jti, userId, hashToken(token), expiresAt]
  );

  return token;
}

export async function generateTokens(
  userId: string,
  email: string
): Promise<{ accessToken: string; refreshToken: string }> {
  return {
    accessToken: signAccessToken(userId, email),
    refreshToken: await issueRefreshToken(userId, email),
  };
}

export async function signup(
  email: string,
  password: string
): Promise<{ user: User; tokens: { accessToken: string; refreshToken: string } }> {
  const normalizedEmail = email.trim().toLowerCase();
  const userId = uuidv4();
  const passwordHash = await hashPassword(password);

  // Rely on the UNIQUE constraint rather than a check-then-insert, which
  // races two concurrent signups for the same address.
  try {
    await execute('INSERT INTO users (id, email, password_hash) VALUES ($1, $2, $3)', [
      userId,
      normalizedEmail,
      passwordHash,
    ]);
  } catch (error: any) {
    if (error?.code === '23505') {
      throw new Error('Email already registered');
    }
    throw error;
  }

  const user = await getUserById(userId);
  const tokens = await generateTokens(userId, normalizedEmail);

  return { user: user!, tokens };
}

export async function login(
  email: string,
  password: string
): Promise<{ user: User; tokens: { accessToken: string; refreshToken: string } }> {
  const normalizedEmail = email.trim().toLowerCase();
  const user = await queryOne<any>('SELECT * FROM users WHERE email = $1', [normalizedEmail]);

  if (!user) {
    // Hash a dummy value anyway so a missing account doesn't answer
    // measurably faster than a wrong password.
    await bcrypt.compare(password, '$2b$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidin');
    throw new InvalidCredentialsError();
  }

  const isValid = await verifyPassword(password, user.password_hash);
  if (!isValid) {
    throw new InvalidCredentialsError();
  }

  const tokens = await generateTokens(user.id, user.email);

  return {
    user: {
      id: user.id,
      email: user.email,
      phone: user.phone,
      preferredCurrency: user.preferred_currency,
      createdAt: user.created_at,
      updatedAt: user.updated_at,
    },
    tokens,
  };
}

/**
 * Verify a refresh token against the stored digest, then rotate it: the
 * presented token is revoked and a fresh one issued. Reuse of an
 * already-revoked token revokes the user's whole family of tokens, which is
 * the standard signal that a token was stolen and replayed.
 */
export async function refreshAccessToken(
  refreshToken: string
): Promise<{ accessToken: string; refreshToken: string }> {
  let decoded: any;
  try {
    decoded = jwt.verify(refreshToken, config.jwt.refreshSecret);
  } catch {
    throw new Error('Invalid refresh token');
  }

  const stored = await queryOne<any>(
    `SELECT id, user_id, token_hash, revoked_at, expires_at FROM refresh_tokens WHERE id = $1`,
    [decoded.jti]
  );

  // Signed by us but absent from the store (or digest mismatch) — treat as forged.
  if (!stored || stored.token_hash !== hashToken(refreshToken)) {
    throw new Error('Invalid refresh token');
  }

  if (stored.revoked_at) {
    logger.warn('Revoked refresh token replayed — revoking all sessions for user', {
      userId: stored.user_id,
    });
    await revokeAllUserTokens(stored.user_id);
    throw new Error('Invalid refresh token');
  }

  if (new Date(stored.expires_at) < new Date()) {
    throw new Error('Invalid refresh token');
  }

  const user = await queryOne<User>('SELECT id, email FROM users WHERE id = $1', [stored.user_id]);
  if (!user) {
    throw new Error('Invalid refresh token');
  }

  const rotated = await issueRefreshToken(user.id, user.email);
  const rotatedJti = (jwt.decode(rotated) as any)?.jti ?? null;
  await execute(
    `UPDATE refresh_tokens SET revoked_at = now(), replaced_by = $1 WHERE id = $2`,
    [rotatedJti, decoded.jti]
  );

  return { accessToken: signAccessToken(user.id, user.email), refreshToken: rotated };
}

/** Revoke a single refresh token (logout on this device). */
export async function revokeRefreshToken(refreshToken: string): Promise<void> {
  try {
    const decoded = jwt.verify(refreshToken, config.jwt.refreshSecret) as any;
    await execute(
      `UPDATE refresh_tokens SET revoked_at = now() WHERE id = $1 AND revoked_at IS NULL`,
      [decoded.jti]
    );
  } catch {
    // A malformed token has nothing to revoke; logout still succeeds.
  }
}

/** Revoke every refresh token for a user (logout everywhere, or theft response). */
export async function revokeAllUserTokens(userId: string): Promise<void> {
  await execute(
    `UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL`,
    [userId]
  );
}

/**
 * Start a password reset. Always resolves — the caller must not reveal
 * whether the address had an account. Returns the raw token when one was
 * created, so the route can email it.
 */
export async function createPasswordResetToken(email: string): Promise<{ token: string; userId: string } | null> {
  const normalizedEmail = email.trim().toLowerCase();
  const user = await queryOne<any>('SELECT id FROM users WHERE email = $1', [normalizedEmail]);
  if (!user) return null;

  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS);

  // Only one live reset token per user.
  await execute(
    `UPDATE password_reset_tokens SET used_at = now() WHERE user_id = $1 AND used_at IS NULL`,
    [user.id]
  );
  await execute(
    `INSERT INTO password_reset_tokens (id, user_id, token_hash, expires_at) VALUES ($1, $2, $3, $4)`,
    [uuidv4(), user.id, hashToken(token), expiresAt]
  );

  return { token, userId: user.id };
}

export async function resetPassword(token: string, newPassword: string): Promise<void> {
  const record = await queryOne<any>(
    `SELECT id, user_id, expires_at, used_at FROM password_reset_tokens WHERE token_hash = $1`,
    [hashToken(token)]
  );

  if (!record || record.used_at || new Date(record.expires_at) < new Date()) {
    throw new Error('Invalid or expired reset token');
  }

  const passwordHash = await hashPassword(newPassword);

  await execute('UPDATE users SET password_hash = $1, updated_at = now() WHERE id = $2', [
    passwordHash,
    record.user_id,
  ]);
  await execute('UPDATE password_reset_tokens SET used_at = now() WHERE id = $1', [record.id]);

  // A password change must invalidate every outstanding session.
  await revokeAllUserTokens(record.user_id);
}

export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string
): Promise<void> {
  const user = await queryOne<any>('SELECT password_hash FROM users WHERE id = $1', [userId]);
  if (!user || !(await verifyPassword(currentPassword, user.password_hash))) {
    throw new InvalidCredentialsError();
  }

  await execute('UPDATE users SET password_hash = $1, updated_at = now() WHERE id = $2', [
    await hashPassword(newPassword),
    userId,
  ]);
  await revokeAllUserTokens(userId);
}

/**
 * Hard-delete the account and everything hanging off it. Apple requires an
 * in-app account deletion path for any app with a signup flow; trackers,
 * devices, alerts and tokens all cascade from users.id.
 */
export async function deleteAccount(userId: string): Promise<void> {
  await execute('DELETE FROM users WHERE id = $1', [userId]);
  logger.info('Account deleted', { userId });
}

export async function getUserById(userId: string): Promise<User | null> {
  return queryOne<User>(
    `SELECT id, email, phone, preferred_currency AS "preferredCurrency",
            created_at AS "createdAt", updated_at AS "updatedAt"
     FROM users WHERE id = $1`,
    [userId]
  );
}

/** Housekeeping for the worker: drop expired/consumed token rows. */
export async function purgeExpiredTokens(): Promise<number> {
  const refreshRows = await execute(
    `DELETE FROM refresh_tokens WHERE expires_at < now() - interval '30 days'`
  );
  const resetRows = await execute(
    `DELETE FROM password_reset_tokens WHERE expires_at < now() - interval '7 days'`
  );
  return refreshRows + resetRows;
}
