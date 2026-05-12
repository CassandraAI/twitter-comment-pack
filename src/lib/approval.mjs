import { randomUUID } from 'crypto';
import {
  answerCallbackQuery,
  editTelegramMessageReplyMarkup,
  getTelegramUpdates,
  sendTelegramMessage,
} from './telegram.mjs';
import { getMeta, setMeta } from './store.mjs';

const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;
const ACTIONS = new Set(['post', 'skip']);

function truncate(text, max = 700) {
  const s = String(text || '').trim();
  return s.length <= max ? s : `${s.slice(0, max - 1)}…`;
}

function tweetUrl(tweet) {
  if (!tweet?.id) return '';
  if (tweet.author && tweet.author !== 'unknown') return `https://x.com/${tweet.author}/status/${tweet.id}`;
  return `https://x.com/i/web/status/${tweet.id}`;
}

function buildApprovalText({ tweet, comment, score, reason }) {
  const scoreLine = Number.isFinite(score) ? `Score: ${score}/100\n` : '';
  const reasonLine = reason ? `Reason: ${truncate(reason, 180)}\n` : '';
  return [
    '🧠 X reply candidate',
    scoreLine + reasonLine,
    `Author: @${tweet.author || 'unknown'}`,
    `Tweet: ${tweetUrl(tweet)}`,
    '',
    'Original:',
    truncate(tweet.fullText, 650),
    '',
    'Reply suggestion:',
    truncate(comment, 280),
  ].filter(Boolean).join('\n');
}

function buildReplyMarkup(approvalId) {
  return {
    inline_keyboard: [[
      { text: '✅ Post', callback_data: `approve:${approvalId}:post` },
      { text: '⏭ Skip', callback_data: `approve:${approvalId}:skip` },
    ]],
  };
}

function parseCallback(data) {
  const parts = String(data || '').split(':');
  if (parts.length !== 3 || parts[0] !== 'approve') return null;
  const [, approvalId, action] = parts;
  if (!approvalId || !ACTIONS.has(action)) return null;
  return { approvalId, action };
}

export function approvalEnabled(cfg) {
  return cfg.approval?.enabled === true || cfg.approval?.mode === 'telegram';
}

export async function requestTelegramApproval({ cfg, tweet, comment, score = null, reason = '' }, log = () => {}) {
  if (!approvalEnabled(cfg)) return { action: 'post', source: 'auto' };

  const token = cfg.telegram?.botToken;
  const chatId = cfg.telegram?.chatId;
  if (!token || !chatId) {
    log('[approval] telegram missing; skipping candidate for safety');
    return { action: 'skip', source: 'missing_telegram' };
  }

  const approvalId = randomUUID().slice(0, 12);
  const timeoutMs = Number(cfg.approval?.timeoutMs) || DEFAULT_TIMEOUT_MS;
  const text = buildApprovalText({ tweet, comment, score, reason });
  const msg = await sendTelegramMessage(token, chatId, {
    text,
    reply_markup: buildReplyMarkup(approvalId),
  });
  log(`[approval] sent ${approvalId} for tweet ${tweet.id}; waiting ${Math.round(timeoutMs / 60000)} min`);

  const offsetKey = 'telegram_update_offset';
  let offset = Number(getMeta(offsetKey) || 0);
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const updates = await getTelegramUpdates(token, offset, 20);
    for (const update of updates || []) {
      if (Number.isFinite(update.update_id)) {
        offset = update.update_id + 1;
        setMeta(offsetKey, offset);
      }
      const cq = update.callback_query;
      const parsed = parseCallback(cq?.data);
      if (!parsed) continue;
      if (parsed.approvalId !== approvalId) {
        await answerCallbackQuery(token, cq.id, 'This approval is from another candidate.');
        continue;
      }

      await answerCallbackQuery(token, cq.id, parsed.action === 'post' ? 'Posting…' : 'Skipped');
      await editTelegramMessageReplyMarkup(token, chatId, msg.message_id, null).catch(() => {});
      log(`[approval] ${approvalId} -> ${parsed.action}`);
      return { action: parsed.action, source: 'telegram', approvalId };
    }
  }

  await editTelegramMessageReplyMarkup(token, chatId, msg.message_id, null).catch(() => {});
  log(`[approval] ${approvalId} timed out; skipped`);
  return { action: 'skip', source: 'timeout', approvalId };
}
