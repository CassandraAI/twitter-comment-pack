/**
 * Telegram helpers.
 * Alerts are fire-and-forget. Interactive approval helpers return errors to callers
 * so the main loop can decide whether to skip or fall back.
 */

const TELEGRAM_API = 'https://api.telegram.org/bot';

async function telegramRequest(token, method, payload = {}) {
  if (!token) throw new Error('Telegram bot token missing');
  const res = await fetch(`${TELEGRAM_API}${token}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ok === false) {
    throw new Error(`Telegram ${method} failed: ${res.status} ${JSON.stringify(data).slice(0, 300)}`);
  }
  return data.result;
}

export async function sendAlert(token, chatId, text) {
  if (!token || !chatId) return;
  try {
    await telegramRequest(token, 'sendMessage', {
      chat_id: chatId,
      text,
      disable_web_page_preview: true,
    });
  } catch {
    // swallow — never crash on telegram alert errors
  }
}

export async function sendTelegramMessage(token, chatId, payload) {
  if (!token || !chatId) throw new Error('telegram.{botToken,chatId} required');
  return telegramRequest(token, 'sendMessage', {
    chat_id: chatId,
    disable_web_page_preview: true,
    ...payload,
  });
}

export async function editTelegramMessageReplyMarkup(token, chatId, messageId, replyMarkup = null) {
  return telegramRequest(token, 'editMessageReplyMarkup', {
    chat_id: chatId,
    message_id: messageId,
    reply_markup: replyMarkup,
  });
}

export async function answerCallbackQuery(token, callbackQueryId, text = '') {
  return telegramRequest(token, 'answerCallbackQuery', {
    callback_query_id: callbackQueryId,
    text,
    show_alert: false,
  });
}

export async function getTelegramUpdates(token, offset = 0, timeout = 20) {
  return telegramRequest(token, 'getUpdates', {
    offset,
    timeout,
    allowed_updates: ['callback_query'],
  });
}
