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

function normalizeOptions({ comment, options }) {
  const raw = Array.isArray(options) && options.length ? options : [comment];
  return raw.map((s) => String(s || '').trim()).filter(Boolean).slice(0, 3);
}

function buildApprovalText({ tweet, comment, options, score, reason }) {
  const choices = normalizeOptions({ comment, options });
  const scoreLine = Number.isFinite(score) ? `Score: ${score}/100\n` : '';
  const reasonLine = reason ? `Reason: ${truncate(reason, 180)}\n` : '';
  const replyBlock = choices
    .map((choice, i) => `${i + 1}. ${truncate(choice, 240)}`)
    .join('\n');

  return [
    '🧠 X reply candidate',
    scoreLine + reasonLine,
    `Author: @${tweet.author || 'unknown'}`,
    `Tweet: ${tweetUrl(tweet)}`,
    '',
    'Original:',
    truncate(tweet.fullText, 650),
    '',
    'Reply options:',
    replyBlock,
  ].filter(Boolean).join('\n');
}

function buildReplyMarkup(approvalId, optionCount = 1) {
  const postButtons = Array.from({ length: optionCount }, (_, i) => ({
    text: optionCount === 1 ? '✅ Post' : `✅ Post ${i + 1}`,
    callback_data: `approve:${approvalId}:post${i}`,
  }));
  return {
    inline_keyboard: [
      postButtons,
      [{ text: '⏭ Skip', callback_data: `approve:${approvalId}:skip` }],
    ],
  };
}

function parseCallback(data) {
  const parts = String(data || '').split(':');
  if (parts.length !== 3 || parts[0] !== 'approve') return null;
  const [, approvalId, rawAction] = parts;
  if (!approvalId) return null;
  if (rawAction === 'skip') return { approvalId, action: 'skip', optionIndex: null };
  const postMatch = rawAction.match(/^post(\d+)$/);
  if (postMatch) return { approvalId, action: 'post', optionIndex: Number(postMatch[1]) };
  if (ACTIONS.has(rawAction)) return { approvalId, action: rawAction, optionIndex: 0 };
  return null;
}

export function approvalEnabled(cfg) {
  return cfg.approval?.enabled === true || cfg.approval?.mode === 'telegram';
}

export async function requestTelegramApproval({ cfg, tweet, comment, options, score = null, reason = '' }, log = () => {}) {
  const choices = normalizeOptions({ comment, options });
  if (!approvalEnabled(cfg)) return { action: 'post', source: 'auto', comment: choices[0] };

  const token = cfg.telegram?.botToken;
  const chatId = cfg.telegram?.chatId;
  if (!token || !chatId) {
    log('[approval] telegram missing; skipping candidate for safety');
    return { action: 'skip', source: 'missing_telegram' };
  }

  const approvalId = randomUUID().slice(0, 12);
  const timeoutMs = Number(cfg.approval?.timeoutMs) || DEFAULT_TIMEOUT_MS;
  const text = buildApprovalText({ tweet, comment: choices[0], options: choices, score, reason });
  const msg = await sendTelegramMessage(token, chatId, {
    text,
    reply_markup: buildReplyMarkup(approvalId, choices.length),
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

      const selected = choices[parsed.optionIndex ?? 0] || choices[0];
      await answerCallbackQuery(token, cq.id, parsed.action === 'post' ? 'Posting…' : 'Skipped');
      await editTelegramMessageReplyMarkup(token, chatId, msg.message_id, null).catch(() => {});
      log(`[approval] ${approvalId} -> ${parsed.action}${parsed.action === 'post' ? ` option ${Number(parsed.optionIndex) + 1}` : ''}`);
      return { action: parsed.action, source: 'telegram', approvalId, comment: selected, optionIndex: parsed.optionIndex };
    }
  }

  await editTelegramMessageReplyMarkup(token, chatId, msg.message_id, null).catch(() => {});
  log(`[approval] ${approvalId} timed out; skipped`);
  return { action: 'skip', source: 'timeout', approvalId };
}
