const DEFAULT_MIN_SCORE = 45;

const TOPIC_WEIGHTS = [
  [/\b(bitcoin|btc|ethereum|eth|solana|sol|crypto|stablecoin|memecoin|airdrop|defi|onchain|wallet|exchange|binance|coinbase)\b/i, 18],
  [/\b(fed|fomc|cpi|inflation|rates?|rate cut|rate hike|powell|treasury|liquidity|dxy|usd|gold|oil|macro)\b/i, 16],
  [/\b(sec|etf|regulation|policy|sanctions|election|geopolitics|war|trade war|tariff|china|russia|ukraine|middle east)\b/i, 14],
  [/\b(pump|dump|liquidation|rekt|bullish|bearish|ath|dip|fomo|fud|degen|bags?|chart|candles?)\b/i, 12],
];

const BAD_PATTERNS = [
  /\b(giveaway|airdrop claim|free mint|whitelist|presale|guaranteed profit|100x|1000x)\b/i,
  /\b(send\s+(eth|btc|sol)|connect wallet|seed phrase|private key)\b/i,
  /\b(follow\s+back|fb\s+pls|like\s+and\s+rt|retweet\s+to\s+win)\b/i,
  /https?:\/\//i,
  /\b(join my|dm me|telegram group|discord group)\b/i,
];

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function ageMinutes(tweet) {
  const ts = new Date(tweet.createdAt || Date.now()).getTime();
  if (!Number.isFinite(ts)) return 9999;
  return Math.max(0, Math.round((Date.now() - ts) / 60000));
}

export function scoreTweet(tweet, cfg = {}) {
  const text = String(tweet?.fullText || '');
  const lower = text.toLowerCase();
  const reasons = [];
  let score = 20;

  if (!tweet?.id || text.trim().length < 20) {
    return { score: 0, shouldSkip: true, reason: 'too short or missing tweet id' };
  }

  for (const pattern of BAD_PATTERNS) {
    if (pattern.test(text)) {
      return { score: 0, shouldSkip: true, reason: `blocked risky/spam pattern: ${pattern}` };
    }
  }

  for (const [pattern, weight] of TOPIC_WEIGHTS) {
    if (pattern.test(text)) {
      score += weight;
      reasons.push(`topic +${weight}`);
    }
  }

  const age = ageMinutes(tweet);
  if (age <= 30) {
    score += 16;
    reasons.push('fresh +16');
  } else if (age <= 180) {
    score += 10;
    reasons.push('recent +10');
  } else if (age <= 720) {
    score += 4;
    reasons.push('same-day +4');
  } else {
    score -= 10;
    reasons.push('old -10');
  }

  if (text.length >= 60 && text.length <= 260) {
    score += 10;
    reasons.push('replyable length +10');
  } else if (text.length > 600) {
    score -= 8;
    reasons.push('too long -8');
  }

  if (/[?!]/.test(text)) {
    score += 5;
    reasons.push('conversation hook +5');
  }

  const cashtags = lower.match(/\$[a-z]{2,10}\b/g) || [];
  if (cashtags.length > 0 && cashtags.length <= 3) {
    score += 7;
    reasons.push('cashtag signal +7');
  } else if (cashtags.length > 5) {
    score -= 10;
    reasons.push('too many cashtags -10');
  }

  const hashtags = lower.match(/#[a-z0-9_]{2,40}\b/g) || [];
  if (hashtags.length > 4) {
    score -= 8;
    reasons.push('hashtag clutter -8');
  }

  if (/\b(breaking|just in|update|confirmed)\b/i.test(text)) {
    score += 6;
    reasons.push('news hook +6');
  }

  if (/\b(not financial advice|nfa)\b/i.test(text)) {
    score -= 4;
    reasons.push('generic crypto phrasing -4');
  }

  score = clamp(score, 0, 100);
  const minScore = Number(cfg.scoring?.minScore) || DEFAULT_MIN_SCORE;
  return {
    score,
    shouldSkip: score < minScore,
    reason: reasons.length ? reasons.join(', ') : 'low topical signal',
  };
}
