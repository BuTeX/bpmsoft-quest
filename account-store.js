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
    lastLoginAt: row.last_login_at,
    emailVerifiedAt: row.email_verified_at,
    termsAcceptedAt: row.terms_accepted_at,
    privacyAcceptedAt: row.privacy_accepted_at,
    policyVersion: row.policy_version
  };
}

const accountSelectColumns = `
  id, email, display_name, password_hash, access_mode, created_at, last_login_at,
  email_verified_at, terms_accepted_at, privacy_accepted_at, policy_version`;

function progressFromRow(row) {
  if (!row) return { chapter1: null, chapter2: null, chapter3: null, chapter4: null, chapter5: null };
  const chapter = (index) => row[`chapter${index}_revision`] == null
    ? null
    : {
        state: row[`chapter${index}_state`] || null,
        score: Number(row[`chapter${index}_score`]) || 0,
        revision: Number(row[`chapter${index}_revision`]) || 0,
        updatedAt: row[`chapter${index}_updated_at`] || row.updated_at
      };
  return {
    chapter1: chapter(1),
    chapter2: chapter(2),
    chapter3: chapter(3),
    chapter4: chapter(4),
    chapter5: chapter(5)
  };
}

function eventFromRow(row) {
  return {
    id: row.id,
    accountId: row.account_id,
    sessionId: row.session_id,
    chapterId: row.chapter_id,
    missionKey: row.mission_key,
    eventType: row.event_type,
    outcome: row.outcome,
    attempt: row.attempt == null ? null : Number(row.attempt),
    durationMs: row.duration_ms == null ? null : Number(row.duration_ms),
    details: row.details || {},
    occurredAt: row.occurred_at,
    displayName: row.display_name,
    email: row.email,
    mode: row.access_mode
  };
}

const progressColumns = {
  chapter1: ["chapter1_state", "chapter1_score", "chapter1_revision", "chapter1_updated_at"],
  chapter2: ["chapter2_state", "chapter2_score", "chapter2_revision", "chapter2_updated_at"],
  chapter3: ["chapter3_state", "chapter3_score", "chapter3_revision", "chapter3_updated_at"],
  chapter4: ["chapter4_state", "chapter4_score", "chapter4_revision", "chapter4_updated_at"],
  chapter5: ["chapter5_state", "chapter5_score", "chapter5_revision", "chapter5_updated_at"]
};

const progressSelectColumns = `
  chapter1_state, chapter1_score, chapter1_revision, chapter1_updated_at,
  chapter2_state, chapter2_score, chapter2_revision, chapter2_updated_at,
  chapter3_state, chapter3_score, chapter3_revision, chapter3_updated_at,
  chapter4_state, chapter4_score, chapter4_revision, chapter4_updated_at,
  chapter5_state, chapter5_score, chapter5_revision, chapter5_updated_at,
  updated_at`;

export class PostgresAccountStore {
  constructor(database) {
    this.database = database;
  }

  async createAccount(account) {
    const result = await this.database.query(
      `INSERT INTO user_accounts (
         id, email, display_name, password_hash, access_mode,
         email_verified_at, terms_accepted_at, privacy_accepted_at, policy_version
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING ${accountSelectColumns}`,
      [
        account.id,
        account.email,
        account.displayName,
        account.passwordHash,
        account.mode,
        account.emailVerifiedAt || null,
        account.termsAcceptedAt || null,
        account.privacyAcceptedAt || null,
        account.policyVersion || null
      ]
    );
    return accountFromRow(result.rows[0]);
  }

  async findAccountByEmail(email) {
    const result = await this.database.query(
      `SELECT ${accountSelectColumns}
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
       RETURNING ${accountSelectColumns}`,
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
      `SELECT a.id, a.email, a.display_name, a.password_hash, a.access_mode, a.created_at, a.last_login_at,
              a.email_verified_at, a.terms_accepted_at, a.privacy_accepted_at,
              a.policy_version
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

  async deleteSessionsForAccount(accountId) {
    await this.database.query("DELETE FROM account_sessions WHERE account_id = $1", [accountId]);
  }

  async createAccountToken(token) {
    await this.database.query(
      `DELETE FROM account_tokens
       WHERE expires_at <= NOW() OR (account_id = $1 AND purpose = $2 AND used_at IS NULL)`,
      [token.accountId, token.purpose]
    );
    await this.database.query(
      `INSERT INTO account_tokens (id, account_id, purpose, token_hash, payload, expires_at)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6)`,
      [token.id, token.accountId, token.purpose, token.tokenHash, JSON.stringify(token.payload || {}), token.expiresAt]
    );
  }

  async consumeAccountToken(tokenHash, purposes) {
    const result = await this.database.query(
      `UPDATE account_tokens
       SET used_at = NOW()
       WHERE token_hash = $1
         AND purpose = ANY($2::text[])
         AND used_at IS NULL
         AND expires_at > NOW()
       RETURNING id, account_id, purpose, payload, expires_at`,
      [tokenHash, purposes]
    );
    if (!result.rows[0]) return null;
    return {
      id: result.rows[0].id,
      accountId: result.rows[0].account_id,
      purpose: result.rows[0].purpose,
      payload: result.rows[0].payload || {},
      expiresAt: result.rows[0].expires_at
    };
  }

  async markEmailVerified(accountId, nextEmail = null) {
    const result = await this.database.query(
      `UPDATE user_accounts
       SET email = COALESCE($2, email),
           email_verified_at = NOW(),
           updated_at = NOW()
       WHERE id = $1
       RETURNING ${accountSelectColumns}`,
      [accountId, nextEmail]
    );
    return accountFromRow(result.rows[0]);
  }

  async updatePassword(accountId, passwordHash) {
    const result = await this.database.query(
      `UPDATE user_accounts
       SET password_hash = $2, updated_at = NOW()
       WHERE id = $1
       RETURNING ${accountSelectColumns}`,
      [accountId, passwordHash]
    );
    return accountFromRow(result.rows[0]);
  }

  async deleteAccount(accountId) {
    const result = await this.database.query(
      "DELETE FROM user_accounts WHERE id = $1 RETURNING id",
      [accountId]
    );
    return result.rowCount === 1;
  }

  async getAccountExport(accountId) {
    const accountResult = await this.database.query(
      `SELECT ${accountSelectColumns} FROM user_accounts WHERE id = $1`,
      [accountId]
    );
    if (!accountResult.rows[0]) return null;
    const eventsResult = await this.database.query(
      `SELECT e.id, e.account_id, e.session_id, e.chapter_id, e.mission_key,
              e.event_type, e.outcome, e.attempt, e.duration_ms, e.details,
              e.occurred_at, a.display_name, a.email, a.access_mode
       FROM learning_events e
       JOIN user_accounts a ON a.id = e.account_id
       WHERE e.account_id = $1
       ORDER BY e.occurred_at`,
      [accountId]
    );
    return {
      account: accountFromRow(accountResult.rows[0]),
      progress: await this.getProgress(accountId),
      events: eventsResult.rows.map(eventFromRow)
    };
  }

  async getProgress(accountId) {
    const result = await this.database.query(
      `SELECT ${progressSelectColumns}
       FROM account_progress WHERE account_id = $1`,
      [accountId]
    );
    return progressFromRow(result.rows[0]);
  }

  async saveProgress(accountId, chapter, state, score, expectedRevision) {
    const [stateColumn, scoreColumn, revisionColumn, chapterUpdatedAtColumn] = progressColumns[chapter];
    const result = await this.database.query(
       `INSERT INTO account_progress (
         account_id, ${stateColumn}, ${scoreColumn}, ${revisionColumn}, ${chapterUpdatedAtColumn}
       )
       SELECT $1, $2::jsonb, $3, 1, NOW()
       WHERE $4 = 0
       ON CONFLICT (account_id) DO UPDATE
       SET ${stateColumn} = EXCLUDED.${stateColumn},
           ${scoreColumn} = EXCLUDED.${scoreColumn},
           ${revisionColumn} = account_progress.${revisionColumn} + 1,
           ${chapterUpdatedAtColumn} = NOW(),
           updated_at = NOW()
       WHERE account_progress.${revisionColumn} = $4
         AND EXCLUDED.${scoreColumn} >= account_progress.${scoreColumn}
       RETURNING ${progressSelectColumns}`,
      [accountId, JSON.stringify(state), score, expectedRevision]
    );
    if (result.rows[0]) return { conflict: false, progress: progressFromRow(result.rows[0])[chapter] };
    const current = await this.getProgress(accountId);
    return { conflict: true, progress: current[chapter] };
  }

  async resetProgress(accountId, chapter) {
    const [stateColumn, scoreColumn, revisionColumn, chapterUpdatedAtColumn] = progressColumns[chapter];
    const result = await this.database.query(
      `INSERT INTO account_progress (
         account_id, ${stateColumn}, ${scoreColumn}, ${revisionColumn}, ${chapterUpdatedAtColumn}
       )
       VALUES ($1, NULL, 0, 1, NOW())
       ON CONFLICT (account_id) DO UPDATE
       SET ${stateColumn} = NULL,
           ${scoreColumn} = 0,
           ${revisionColumn} = account_progress.${revisionColumn} + 1,
           ${chapterUpdatedAtColumn} = NOW(),
           updated_at = NOW()
       RETURNING ${progressSelectColumns}`,
      [accountId]
    );
    return progressFromRow(result.rows[0])[chapter];
  }

  async getAnalyticsRecords() {
    const result = await this.database.query(
      `SELECT a.id, a.email, a.display_name, a.access_mode, a.created_at, a.last_login_at,
              p.chapter1_state, p.chapter1_score, p.chapter1_revision, p.chapter1_updated_at,
              p.chapter2_state, p.chapter2_score, p.chapter2_revision, p.chapter2_updated_at,
              p.chapter3_state, p.chapter3_score, p.chapter3_revision, p.chapter3_updated_at,
              p.chapter4_state, p.chapter4_score, p.chapter4_revision, p.chapter4_updated_at,
              p.chapter5_state, p.chapter5_score, p.chapter5_revision, p.chapter5_updated_at,
              p.updated_at
       FROM user_accounts a
       LEFT JOIN account_progress p ON p.account_id = a.id
       ORDER BY a.created_at DESC`
    );
    return result.rows.map((row) => ({
      account: accountFromRow(row),
      progress: progressFromRow(row)
    }));
  }

  async recordLearningEvents(accountId, events) {
    if (!events.length) return 0;
    const values = [];
    const placeholders = events.map((event, index) => {
      const offset = index * 11;
      values.push(
        event.id,
        accountId,
        event.sessionId,
        event.chapterId,
        event.missionKey,
        event.eventType,
        event.outcome,
        event.attempt,
        event.durationMs,
        JSON.stringify(event.details),
        event.occurredAt
      );
      return `(${Array.from({ length: 11 }, (_, column) => `$${offset + column + 1}`).join(", ")})`;
    });
    const result = await this.database.query(
      `INSERT INTO learning_events (
         id, account_id, session_id, chapter_id, mission_key, event_type,
         outcome, attempt, duration_ms, details, occurred_at
       )
       VALUES ${placeholders.join(", ")}
       ON CONFLICT (id) DO NOTHING`,
      values
    );
    return result.rowCount || 0;
  }

  async getAnalyticsEvents(since) {
    const result = await this.database.query(
      `SELECT e.id, e.account_id, e.session_id, e.chapter_id, e.mission_key,
              e.event_type, e.outcome, e.attempt, e.duration_ms, e.details,
              e.occurred_at, a.display_name, a.email, a.access_mode
       FROM learning_events e
       JOIN user_accounts a ON a.id = e.account_id
       WHERE e.occurred_at >= $1
       ORDER BY e.occurred_at DESC
       LIMIT 100000`,
      [since]
    );
    return result.rows.map(eventFromRow);
  }
}

export class MemoryAccountStore {
  constructor() {
    this.accounts = new Map();
    this.accountIdsByEmail = new Map();
    this.sessions = new Map();
    this.progress = new Map();
    this.learningEvents = new Map();
    this.accountTokens = new Map();
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

  async deleteSessionsForAccount(accountId) {
    for (const [tokenHash, session] of this.sessions) {
      if (session.accountId === accountId) this.sessions.delete(tokenHash);
    }
  }

  async createAccountToken(token) {
    const now = Date.now();
    for (const [hash, saved] of this.accountTokens) {
      if (
        new Date(saved.expiresAt).getTime() <= now
        || (saved.accountId === token.accountId && saved.purpose === token.purpose && !saved.usedAt)
      ) this.accountTokens.delete(hash);
    }
    this.accountTokens.set(token.tokenHash, clone({ ...token, usedAt: null }));
  }

  async consumeAccountToken(tokenHash, purposes) {
    const token = this.accountTokens.get(tokenHash);
    if (
      !token
      || token.usedAt
      || !purposes.includes(token.purpose)
      || new Date(token.expiresAt).getTime() <= Date.now()
    ) return null;
    token.usedAt = new Date().toISOString();
    return clone(token);
  }

  async markEmailVerified(accountId, nextEmail = null) {
    const account = this.accounts.get(accountId);
    if (!account) return null;
    if (nextEmail && nextEmail !== account.email) {
      if (this.accountIdsByEmail.has(nextEmail)) {
        const error = new Error("Account already exists");
        error.code = "23505";
        throw error;
      }
      this.accountIdsByEmail.delete(account.email);
      account.email = nextEmail;
      this.accountIdsByEmail.set(nextEmail, accountId);
    }
    account.emailVerifiedAt = new Date().toISOString();
    return clone(account);
  }

  async updatePassword(accountId, passwordHash) {
    const account = this.accounts.get(accountId);
    if (!account) return null;
    account.passwordHash = passwordHash;
    return clone(account);
  }

  async deleteAccount(accountId) {
    const account = this.accounts.get(accountId);
    if (!account) return false;
    await this.deleteSessionsForAccount(accountId);
    this.accountIdsByEmail.delete(account.email);
    this.accounts.delete(accountId);
    this.progress.delete(accountId);
    for (const [eventId, event] of this.learningEvents) {
      if (event.accountId === accountId) this.learningEvents.delete(eventId);
    }
    for (const [tokenHash, token] of this.accountTokens) {
      if (token.accountId === accountId) this.accountTokens.delete(tokenHash);
    }
    return true;
  }

  async getAccountExport(accountId) {
    const account = this.accounts.get(accountId);
    if (!account) return null;
    return {
      account: clone(account),
      progress: await this.getProgress(accountId),
      events: [...this.learningEvents.values()]
        .filter((event) => event.accountId === accountId)
        .map(clone)
    };
  }

  async getProgress(accountId) {
    return clone(this.progress.get(accountId) || { chapter1: null, chapter2: null, chapter3: null, chapter4: null, chapter5: null });
  }

  async saveProgress(accountId, chapter, state, score, expectedRevision) {
    const saved = this.progress.get(accountId) || { chapter1: null, chapter2: null, chapter3: null, chapter4: null, chapter5: null };
    const current = saved[chapter];
    const currentRevision = current?.revision || 0;
    if (expectedRevision !== currentRevision || (current && score < current.score)) {
      return { conflict: true, progress: clone(current) };
    }
    saved[chapter] = {
      state: clone(state),
      score,
      revision: currentRevision + 1,
      updatedAt: new Date().toISOString()
    };
    this.progress.set(accountId, saved);
    return { conflict: false, progress: clone(saved[chapter]) };
  }

  async resetProgress(accountId, chapter) {
    const saved = this.progress.get(accountId) || { chapter1: null, chapter2: null, chapter3: null, chapter4: null, chapter5: null };
    const revision = (saved[chapter]?.revision || 0) + 1;
    saved[chapter] = { state: null, score: 0, revision, updatedAt: new Date().toISOString() };
    this.progress.set(accountId, saved);
    return clone(saved[chapter]);
  }

  async getAnalyticsRecords() {
    return [...this.accounts.values()]
      .sort((left, right) => new Date(right.createdAt) - new Date(left.createdAt))
      .map((account) => ({
        account: clone(account),
        progress: clone(this.progress.get(account.id) || {
          chapter1: null,
          chapter2: null,
          chapter3: null,
          chapter4: null,
          chapter5: null
        })
      }));
  }

  async recordLearningEvents(accountId, events) {
    let inserted = 0;
    for (const event of events) {
      if (this.learningEvents.has(event.id)) continue;
      this.learningEvents.set(event.id, { ...clone(event), accountId });
      inserted += 1;
    }
    return inserted;
  }

  async getAnalyticsEvents(since) {
    const threshold = new Date(since).getTime();
    return [...this.learningEvents.values()]
      .filter((event) => new Date(event.occurredAt).getTime() >= threshold)
      .sort((left, right) => new Date(right.occurredAt) - new Date(left.occurredAt))
      .slice(0, 100000)
      .map((event) => {
        const account = this.accounts.get(event.accountId);
        return {
          ...clone(event),
          displayName: account?.displayName || "",
          email: account?.email || "",
          mode: account?.mode || "progression"
        };
      });
  }
}
