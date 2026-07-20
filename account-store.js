function clone(value) {
  return value == null ? value : structuredClone(value);
}

function accountFromRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    passwordHash: row.password_hash,
    mode: row.access_mode,
    createdAt: row.created_at,
    lastLoginAt: row.last_login_at
  };
}

function progressFromRow(row) {
  if (!row) return { chapter1: null, chapter2: null };
  return {
    chapter1: row.chapter1_state
      ? { state: row.chapter1_state, score: Number(row.chapter1_score) || 0, updatedAt: row.updated_at }
      : null,
    chapter2: row.chapter2_state
      ? { state: row.chapter2_state, score: Number(row.chapter2_score) || 0, updatedAt: row.updated_at }
      : null
  };
}

export class PostgresAccountStore {
  constructor(database) {
    this.database = database;
  }

  async createAccount(account) {
    const result = await this.database.query(
      `INSERT INTO user_accounts (id, email, display_name, password_hash, access_mode)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, email, display_name, password_hash, access_mode, created_at, last_login_at`,
      [account.id, account.email, account.displayName, account.passwordHash, account.mode]
    );
    return accountFromRow(result.rows[0]);
  }

  async findAccountByEmail(email) {
    const result = await this.database.query(
      `SELECT id, email, display_name, password_hash, access_mode, created_at, last_login_at
       FROM user_accounts WHERE email = $1`,
      [email]
    );
    return accountFromRow(result.rows[0]);
  }

  async updateAccount(accountId, { displayName, mode, markLogin = false }) {
    const result = await this.database.query(
      `UPDATE user_accounts
       SET display_name = COALESCE($2, display_name),
           access_mode = COALESCE($3, access_mode),
           last_login_at = CASE WHEN $4 THEN NOW() ELSE last_login_at END,
           updated_at = NOW()
       WHERE id = $1
       RETURNING id, email, display_name, password_hash, access_mode, created_at, last_login_at`,
      [accountId, displayName || null, mode || null, markLogin]
    );
    return accountFromRow(result.rows[0]);
  }

  async createSession({ tokenHash, accountId, expiresAt }) {
    await this.database.query("DELETE FROM account_sessions WHERE expires_at <= NOW()");
    await this.database.query(
      `INSERT INTO account_sessions (token_hash, account_id, expires_at)
       VALUES ($1, $2, $3)`,
      [tokenHash, accountId, expiresAt]
    );
  }

  async findAccountBySession(tokenHash) {
    const result = await this.database.query(
      `SELECT a.id, a.email, a.display_name, a.password_hash, a.access_mode, a.created_at, a.last_login_at
       FROM account_sessions s
       JOIN user_accounts a ON a.id = s.account_id
       WHERE s.token_hash = $1 AND s.expires_at > NOW()`,
      [tokenHash]
    );
    return accountFromRow(result.rows[0]);
  }

  async deleteSession(tokenHash) {
    await this.database.query("DELETE FROM account_sessions WHERE token_hash = $1", [tokenHash]);
  }

  async getProgress(accountId) {
    const result = await this.database.query(
      `SELECT chapter1_state, chapter1_score, chapter2_state, chapter2_score, updated_at
       FROM account_progress WHERE account_id = $1`,
      [accountId]
    );
    return progressFromRow(result.rows[0]);
  }

  async saveProgress(accountId, chapter, state, score) {
    const firstChapter = chapter === "chapter1";
    const stateColumn = firstChapter ? "chapter1_state" : "chapter2_state";
    const scoreColumn = firstChapter ? "chapter1_score" : "chapter2_score";
    const result = await this.database.query(
      `INSERT INTO account_progress (account_id, ${stateColumn}, ${scoreColumn})
       VALUES ($1, $2::jsonb, $3)
       ON CONFLICT (account_id) DO UPDATE
       SET ${stateColumn} = CASE
             WHEN EXCLUDED.${scoreColumn} >= account_progress.${scoreColumn} THEN EXCLUDED.${stateColumn}
             ELSE account_progress.${stateColumn}
           END,
           ${scoreColumn} = GREATEST(account_progress.${scoreColumn}, EXCLUDED.${scoreColumn}),
           updated_at = NOW()
       RETURNING chapter1_state, chapter1_score, chapter2_state, chapter2_score, updated_at`,
      [accountId, JSON.stringify(state), score]
    );
    return progressFromRow(result.rows[0])[chapter];
  }

  async resetProgress(accountId, chapter) {
    const firstChapter = chapter === "chapter1";
    const stateColumn = firstChapter ? "chapter1_state" : "chapter2_state";
    const scoreColumn = firstChapter ? "chapter1_score" : "chapter2_score";
    const result = await this.database.query(
      `INSERT INTO account_progress (account_id, ${stateColumn}, ${scoreColumn})
       VALUES ($1, NULL, 0)
       ON CONFLICT (account_id) DO UPDATE
       SET ${stateColumn} = NULL, ${scoreColumn} = 0, updated_at = NOW()
       RETURNING chapter1_state, chapter1_score, chapter2_state, chapter2_score, updated_at`,
      [accountId]
    );
    return progressFromRow(result.rows[0])[chapter];
  }
}

export class MemoryAccountStore {
  constructor() {
    this.accounts = new Map();
    this.accountIdsByEmail = new Map();
    this.sessions = new Map();
    this.progress = new Map();
  }

  async createAccount(account) {
    if (this.accountIdsByEmail.has(account.email)) {
      const error = new Error("Account already exists");
      error.code = "23505";
      throw error;
    }
    const now = new Date().toISOString();
    const saved = { ...account, createdAt: now, lastLoginAt: null };
    this.accounts.set(account.id, saved);
    this.accountIdsByEmail.set(account.email, account.id);
    return clone(saved);
  }

  async findAccountByEmail(email) {
    const accountId = this.accountIdsByEmail.get(email);
    return clone(accountId ? this.accounts.get(accountId) : null);
  }

  async updateAccount(accountId, { displayName, mode, markLogin = false }) {
    const account = this.accounts.get(accountId);
    if (!account) return null;
    if (displayName) account.displayName = displayName;
    if (mode) account.mode = mode;
    if (markLogin) account.lastLoginAt = new Date().toISOString();
    return clone(account);
  }

  async createSession({ tokenHash, accountId, expiresAt }) {
    const now = Date.now();
    for (const [hash, session] of this.sessions) {
      if (session.expiresAt.getTime() <= now) this.sessions.delete(hash);
    }
    this.sessions.set(tokenHash, { accountId, expiresAt: new Date(expiresAt) });
  }

  async findAccountBySession(tokenHash) {
    const session = this.sessions.get(tokenHash);
    if (!session || session.expiresAt.getTime() <= Date.now()) {
      if (session) this.sessions.delete(tokenHash);
      return null;
    }
    return clone(this.accounts.get(session.accountId));
  }

  async deleteSession(tokenHash) {
    this.sessions.delete(tokenHash);
  }

  async getProgress(accountId) {
    return clone(this.progress.get(accountId) || { chapter1: null, chapter2: null });
  }

  async saveProgress(accountId, chapter, state, score) {
    const saved = this.progress.get(accountId) || { chapter1: null, chapter2: null };
    const current = saved[chapter];
    if (!current || score >= current.score) {
      saved[chapter] = { state: clone(state), score, updatedAt: new Date().toISOString() };
    }
    this.progress.set(accountId, saved);
    return clone(saved[chapter]);
  }

  async resetProgress(accountId, chapter) {
    const saved = this.progress.get(accountId) || { chapter1: null, chapter2: null };
    saved[chapter] = null;
    this.progress.set(accountId, saved);
    return null;
  }
}
