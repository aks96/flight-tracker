import { jest } from '@jest/globals';

const query = jest.fn<any>();
const queryOne = jest.fn<any>();
const execute = jest.fn<any>(async () => 1);

jest.unstable_mockModule('../src/db/connection.js', () => ({
  query,
  queryOne,
  execute,
  getPool: () => ({}),
  closePool: async () => undefined,
  isDatabaseHealthy: async () => true,
  withTransaction: async (fn: any) => fn({}),
}));

process.env.JWT_SECRET = 'x'.repeat(40);
process.env.JWT_REFRESH_SECRET = 'y'.repeat(40);

const authService = await import('../src/services/auth.service.js');
const { InvalidCredentialsError } = authService;

describe('login', () => {
  it('reports an unknown email and a wrong password identically', async () => {
    // Distinguishable errors here let anyone enumerate registered addresses.
    queryOne.mockResolvedValueOnce(null);
    const unknownEmail = await authService.login('nobody@example.com', 'whatever').catch((e) => e);

    const hash = await authService.hashPassword('correct-horse');
    queryOne.mockResolvedValueOnce({ id: 'u1', email: 'a@b.com', password_hash: hash });
    const wrongPassword = await authService.login('a@b.com', 'wrong-password').catch((e) => e);

    expect(unknownEmail).toBeInstanceOf(InvalidCredentialsError);
    expect(wrongPassword).toBeInstanceOf(InvalidCredentialsError);
    expect(unknownEmail.message).toBe(wrongPassword.message);
  });

  it('normalizes the email before lookup', async () => {
    queryOne.mockResolvedValueOnce(null);
    await authService.login('  MiXeD@Example.COM ', 'pw').catch(() => undefined);

    expect(queryOne).toHaveBeenCalledWith(expect.any(String), ['mixed@example.com']);
  });

  it('issues tokens and persists the refresh digest on success', async () => {
    const hash = await authService.hashPassword('correct-horse');
    queryOne.mockResolvedValueOnce({
      id: 'u1',
      email: 'a@b.com',
      password_hash: hash,
      preferred_currency: 'INR',
    });

    const result = await authService.login('a@b.com', 'correct-horse');

    expect(result.tokens.accessToken).toEqual(expect.any(String));
    expect(result.tokens.refreshToken).toEqual(expect.any(String));

    // The stored value must be a digest, never the token itself.
    const insert = execute.mock.calls.find((call: any) => String(call[0]).includes('refresh_tokens'));
    expect(insert).toBeDefined();
    const storedHash = (insert as any)[1][2];
    expect(storedHash).toMatch(/^[a-f0-9]{64}$/);
    expect(storedHash).not.toBe(result.tokens.refreshToken);
  });
});

describe('password hashing', () => {
  it('round-trips a password and rejects the wrong one', async () => {
    const hash = await authService.hashPassword('s3cret-passphrase');
    expect(hash).not.toContain('s3cret-passphrase');
    expect(await authService.verifyPassword('s3cret-passphrase', hash)).toBe(true);
    expect(await authService.verifyPassword('other', hash)).toBe(false);
  });

  it('uses a cost factor of at least 12', async () => {
    const hash = await authService.hashPassword('anything');
    const cost = parseInt(hash.split('$')[2], 10);
    expect(cost).toBeGreaterThanOrEqual(12);
  });
});

describe('signup', () => {
  it('translates the unique-violation race into a clear error', async () => {
    // Two concurrent signups for the same address hit the constraint, which a
    // check-then-insert would miss entirely.
    execute.mockRejectedValueOnce(Object.assign(new Error('duplicate key'), { code: '23505' }));

    await expect(authService.signup('taken@example.com', 'password123')).rejects.toThrow(
      'Email already registered'
    );
  });
});

describe('refresh token rotation', () => {
  const makeStored = (overrides: Record<string, unknown> = {}) => ({
    id: 'jti-1',
    user_id: 'u1',
    revoked_at: null,
    expires_at: new Date(Date.now() + 86_400_000),
    ...overrides,
  });

  async function issueToken() {
    queryOne.mockResolvedValueOnce({
      id: 'u1',
      email: 'a@b.com',
      password_hash: await authService.hashPassword('pw'),
      preferred_currency: 'INR',
    });
    const { tokens } = await authService.login('a@b.com', 'pw');
    const digest = (execute.mock.calls.find((c: any) => String(c[0]).includes('refresh_tokens')) as any)[1][2];
    execute.mockClear();
    return { token: tokens.refreshToken, digest };
  }

  it('rotates the token and revokes the presented one', async () => {
    const { token, digest } = await issueToken();
    queryOne
      .mockResolvedValueOnce(makeStored({ token_hash: digest }))
      .mockResolvedValueOnce({ id: 'u1', email: 'a@b.com' });

    const result = await authService.refreshAccessToken(token);

    expect(result.refreshToken).not.toBe(token);
    expect(
      execute.mock.calls.some((call: any) => String(call[0]).includes('revoked_at = now()'))
    ).toBe(true);
  });

  it('rejects a token whose stored digest does not match', async () => {
    const { token } = await issueToken();
    queryOne.mockResolvedValueOnce(makeStored({ token_hash: 'a'.repeat(64) }));

    await expect(authService.refreshAccessToken(token)).rejects.toThrow('Invalid refresh token');
  });

  it('revokes every session when a already-revoked token is replayed', async () => {
    // Replay is the standard signal that a refresh token was stolen.
    const { token, digest } = await issueToken();
    queryOne.mockResolvedValueOnce(makeStored({ token_hash: digest, revoked_at: new Date() }));

    await expect(authService.refreshAccessToken(token)).rejects.toThrow('Invalid refresh token');

    const revokeAll = execute.mock.calls.find((call: any) =>
      String(call[0]).includes('user_id = $1 AND revoked_at IS NULL')
    );
    expect(revokeAll).toBeDefined();
  });

  it('rejects an expired stored token', async () => {
    const { token, digest } = await issueToken();
    queryOne.mockResolvedValueOnce(
      makeStored({ token_hash: digest, expires_at: new Date(Date.now() - 1000) })
    );

    await expect(authService.refreshAccessToken(token)).rejects.toThrow('Invalid refresh token');
  });

  it('rejects a garbage token outright', async () => {
    await expect(authService.refreshAccessToken('not-a-jwt')).rejects.toThrow('Invalid refresh token');
  });
});

describe('resetPassword', () => {
  it('refuses an expired reset token', async () => {
    queryOne.mockResolvedValueOnce({
      id: 'rst-1',
      user_id: 'u1',
      expires_at: new Date(Date.now() - 1000),
      used_at: null,
    });

    await expect(authService.resetPassword('token', 'new-password-123')).rejects.toThrow(
      'Invalid or expired reset token'
    );
  });

  it('refuses a token that was already used', async () => {
    queryOne.mockResolvedValueOnce({
      id: 'rst-1',
      user_id: 'u1',
      expires_at: new Date(Date.now() + 1000),
      used_at: new Date(),
    });

    await expect(authService.resetPassword('token', 'new-password-123')).rejects.toThrow(
      'Invalid or expired reset token'
    );
  });

  it('revokes all sessions after a successful reset', async () => {
    queryOne.mockResolvedValueOnce({
      id: 'rst-1',
      user_id: 'u1',
      expires_at: new Date(Date.now() + 60_000),
      used_at: null,
    });

    await authService.resetPassword('token', 'new-password-123');

    expect(
      execute.mock.calls.some((call: any) => String(call[0]).includes('UPDATE refresh_tokens SET revoked_at'))
    ).toBe(true);
  });
});
