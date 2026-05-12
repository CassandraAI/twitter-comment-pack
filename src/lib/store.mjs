import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

let db = null;

export function initStore(dbPath = 'data/store.db') {
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS commented (
      tweet_id TEXT PRIMARY KEY,
      ts INTEGER NOT NULL,
      author TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_commented_ts ON commented(ts);

    CREATE TABLE IF NOT EXISTS replies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_tweet_id TEXT NOT NULL,
      reply_tweet_id TEXT,
      author TEXT,
      posted_ts INTEGER NOT NULL,
      lang TEXT,
      score INTEGER,
      score_reason TEXT,
      option_index INTEGER,
      reply_text TEXT NOT NULL,
      source_text TEXT,
      status TEXT DEFAULT 'posted',
      last_checked_ts INTEGER,
      like_count INTEGER,
      reply_count INTEGER,
      retweet_count INTEGER,
      quote_count INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_replies_posted_ts ON replies(posted_ts);
    CREATE INDEX IF NOT EXISTS idx_replies_source_tweet_id ON replies(source_tweet_id);
    CREATE INDEX IF NOT EXISTS idx_replies_reply_tweet_id ON replies(reply_tweet_id);

    CREATE TABLE IF NOT EXISTS skipped_candidates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tweet_id TEXT NOT NULL,
      ts INTEGER NOT NULL,
      author TEXT,
      score INTEGER,
      reason TEXT,
      source_text TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_skipped_candidates_ts ON skipped_candidates(ts);

    CREATE TABLE IF NOT EXISTS warmup_state (
      target TEXT NOT NULL,
      tweet_id TEXT NOT NULL,
      action TEXT NOT NULL,
      last_action_ts INTEGER NOT NULL,
      PRIMARY KEY(target, tweet_id, action)
    );

    CREATE TABLE IF NOT EXISTS meta (
      k TEXT PRIMARY KEY,
      v TEXT
    );
  `);
  return db;
}

export function getDb() {
  if (!db) throw new Error('Store not initialized. Call initStore() first.');
  return db;
}

export function alreadyCommented(tweetId) {
  if (!db) return false;
  const row = db.prepare('SELECT 1 FROM commented WHERE tweet_id = ?').get(tweetId);
  return !!row;
}

export function markCommented(tweetId, author = '') {
  db.prepare('INSERT OR REPLACE INTO commented(tweet_id, ts, author) VALUES(?, ?, ?)')
    .run(tweetId, Date.now(), author);
}

export function recordPostedReply({
  sourceTweetId,
  replyTweetId = '',
  author = '',
  lang = '',
  score = null,
  scoreReason = '',
  optionIndex = null,
  replyText,
  sourceText = '',
}) {
  if (!db) return;
  db.prepare(`
    INSERT INTO replies(
      source_tweet_id, reply_tweet_id, author, posted_ts, lang, score, score_reason,
      option_index, reply_text, source_text, status
    ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'posted')
  `).run(
    sourceTweetId,
    replyTweetId,
    author,
    Date.now(),
    lang,
    Number.isFinite(score) ? score : null,
    scoreReason,
    Number.isFinite(optionIndex) ? optionIndex : null,
    replyText,
    sourceText,
  );
}

export function recordSkippedCandidate({ tweetId, author = '', score = null, reason = '', sourceText = '' }) {
  if (!db) return;
  db.prepare(`
    INSERT INTO skipped_candidates(tweet_id, ts, author, score, reason, source_text)
    VALUES(?, ?, ?, ?, ?, ?)
  `).run(tweetId, Date.now(), author, Number.isFinite(score) ? score : null, reason, sourceText);
}

export function updateReplyMetrics({ replyTweetId, likeCount, replyCount, retweetCount, quoteCount }) {
  if (!db || !replyTweetId) return;
  db.prepare(`
    UPDATE replies
    SET last_checked_ts = ?, like_count = ?, reply_count = ?, retweet_count = ?, quote_count = ?
    WHERE reply_tweet_id = ?
  `).run(
    Date.now(),
    Number.isFinite(likeCount) ? likeCount : null,
    Number.isFinite(replyCount) ? replyCount : null,
    Number.isFinite(retweetCount) ? retweetCount : null,
    Number.isFinite(quoteCount) ? quoteCount : null,
    replyTweetId,
  );
}

export function recentReplies(limit = 50) {
  if (!db) return [];
  return db.prepare(`
    SELECT * FROM replies ORDER BY posted_ts DESC LIMIT ?
  `).all(limit);
}

export function analyticsSummary(days = 7) {
  if (!db) return null;
  const since = Date.now() - days * 24 * 60 * 60 * 1000;
  const total = db.prepare('SELECT COUNT(*) AS c FROM replies WHERE posted_ts >= ?').get(since).c;
  const skipped = db.prepare('SELECT COUNT(*) AS c FROM skipped_candidates WHERE ts >= ?').get(since).c;
  const byOption = db.prepare(`
    SELECT option_index AS optionIndex, COUNT(*) AS count,
      ROUND(AVG(COALESCE(like_count, 0)), 2) AS avgLikes,
      ROUND(AVG(COALESCE(reply_count, 0)), 2) AS avgReplies
    FROM replies
    WHERE posted_ts >= ?
    GROUP BY option_index
    ORDER BY count DESC
  `).all(since);
  const top = db.prepare(`
    SELECT source_tweet_id AS sourceTweetId, reply_tweet_id AS replyTweetId, author, posted_ts AS postedTs,
      score, option_index AS optionIndex, reply_text AS replyText,
      COALESCE(like_count, 0) AS likes, COALESCE(reply_count, 0) AS replies,
      COALESCE(retweet_count, 0) AS retweets, COALESCE(quote_count, 0) AS quotes
    FROM replies
    WHERE posted_ts >= ?
    ORDER BY (COALESCE(like_count, 0) + COALESCE(reply_count, 0) * 2 + COALESCE(retweet_count, 0) * 3 + COALESCE(quote_count, 0) * 3) DESC,
      posted_ts DESC
    LIMIT 10
  `).all(since);
  return { days, totalPosted: total, totalSkipped: skipped, byOption, top };
}

export function commentsInLastHour() {
  if (!db) return 0;
  const since = Date.now() - 60 * 60 * 1000;
  const row = db.prepare('SELECT COUNT(*) AS c FROM commented WHERE ts >= ?').get(since);
  return row.c;
}

export function warmupSeen(target, tweetId, action) {
  if (!db) return false;
  const row = db.prepare(
    'SELECT 1 FROM warmup_state WHERE target = ? AND tweet_id = ? AND action = ?'
  ).get(target, tweetId, action);
  return !!row;
}

export function warmupMark(target, tweetId, action) {
  db.prepare(
    'INSERT OR REPLACE INTO warmup_state(target, tweet_id, action, last_action_ts) VALUES(?, ?, ?, ?)'
  ).run(target, tweetId, action, Date.now());
}

export function getMeta(k) {
  if (!db) return null;
  const row = db.prepare('SELECT v FROM meta WHERE k = ?').get(k);
  return row ? row.v : null;
}

export function setMeta(k, v) {
  db.prepare('INSERT OR REPLACE INTO meta(k, v) VALUES(?, ?)').run(k, String(v));
}
