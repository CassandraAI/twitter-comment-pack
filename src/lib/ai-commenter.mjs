/**
 * Multi-provider AI comment generator.
 * Supports: deepseek, openai, anthropic. All via fetch — no SDK deps.
 */
import { isFollowBackRequest, followBackReply } from './language.mjs';

const LANG_INSTRUCTION = {
  en: 'Write the reply in English.',
  ja: '日本語で返信を書いてください。',
  ko: '한국어로 답글을 작성하세요.',
  zh: '请用中文（简体）写回复。',
};

function buildPrompt({ tweetText, lang, style }) {
  const styleLine = style && style.trim()
    ? `Style/persona: ${style.trim()}`
    : 'Style: human, casual, natural — not robotic.';
  return `You are a real Twitter/X user leaving a comment on a tweet. Your comment must be:
- 1 sentence max, under 180 characters
- Human and natural, NOT robotic or AI-sounding
- Contextually appropriate to the tweet: funny, insightful, curious, or lightly sarcastic
- No hashtags, no URLs, minimal emoji
- Do not shill tokens, do not promise profit, do not give financial advice
- For politics/geopolitics, avoid misinformation and avoid instructing people how to vote
- ${LANG_INSTRUCTION[lang] || LANG_INSTRUCTION.en}
- ${styleLine}

Tweet content:
"${tweetText.slice(0, 500)}"

Reply with ONLY the comment text. Nothing else.`;
}

function buildMultiPrompt({ tweetText, lang, style, count }) {
  const styleLine = style && style.trim()
    ? `Style/persona: ${style.trim()}`
    : 'Style: crypto/macro meme account, witty, natural, not robotic.';
  return `You are writing reply options for a Twitter/X crypto + macro meme account.

Rules:
- Create exactly ${count} distinct reply options
- Each option must be 1 sentence and under 180 characters
- No hashtags, no URLs, no token shilling, no financial advice
- Avoid generic replies like "bullish", "this is huge", "send it", "we are early"
- For politics/geopolitics, joke about the market/system/situation, not voter manipulation or unverified claims
- ${LANG_INSTRUCTION[lang] || LANG_INSTRUCTION.en}
- ${styleLine}

Make the options different:
1. witty/sarcastic
2. clean meme
3. curious or insight-based

Tweet content:
"${tweetText.slice(0, 700)}"

Return ONLY a JSON array of strings, no markdown.`;
}

async function callDeepseek({ apiKey, model, prompt }) {
  const res = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: model || 'deepseek-chat',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 300,
      temperature: 0.95,
    }),
  });
  if (!res.ok) throw new Error(`DeepSeek HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  return (data?.choices?.[0]?.message?.content || '').trim();
}

async function callOpenAI({ apiKey, model, prompt }) {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: model || 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 300,
      temperature: 0.95,
    }),
  });
  if (!res.ok) throw new Error(`OpenAI HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  return (data?.choices?.[0]?.message?.content || '').trim();
}

async function callAnthropic({ apiKey, model, prompt }) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: model || 'claude-haiku-4-5',
      max_tokens: 400,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!res.ok) throw new Error(`Anthropic HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  const block = (data?.content || []).find((b) => b.type === 'text');
  return (block?.text || '').trim();
}

async function callProvider({ ai, prompt }) {
  const provider = (ai.provider || 'deepseek').toLowerCase();
  if (provider === 'deepseek') return callDeepseek({ apiKey: ai.apiKey, model: ai.model, prompt });
  if (provider === 'openai') return callOpenAI({ apiKey: ai.apiKey, model: ai.model, prompt });
  if (provider === 'anthropic') return callAnthropic({ apiKey: ai.apiKey, model: ai.model, prompt });
  throw new Error(`Unknown AI provider: ${provider}`);
}

function cleanComment(text) {
  return String(text || '')
    .replace(/^["'`\s-]+|["'`\s]+$/g, '')
    .replace(/^\d+[.)]\s*/, '')
    .trim();
}

function parseJsonArray(text) {
  const raw = String(text || '').trim().replace(/^```json\s*|^```\s*|```$/g, '').trim();
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.map(cleanComment).filter(Boolean);
  } catch {}
  return raw
    .split('\n')
    .map(cleanComment)
    .filter((s) => s && !/^\[|\]$/.test(s));
}

export async function generateComment({ tweetText, lang, style, ai }) {
  if (isFollowBackRequest(tweetText)) {
    return followBackReply(lang);
  }
  const prompt = buildPrompt({ tweetText, lang, style });
  const text = await callProvider({ ai, prompt });
  const cleaned = cleanComment(text);
  if (!cleaned) throw new Error('AI returned empty comment');
  return cleaned;
}

export async function generateCommentOptions({ tweetText, lang, style, ai, count = 3 }) {
  if (isFollowBackRequest(tweetText)) {
    return [followBackReply(lang)];
  }
  const prompt = buildMultiPrompt({ tweetText, lang, style, count });
  const text = await callProvider({ ai, prompt });
  const options = [...new Set(parseJsonArray(text))]
    .map((s) => s.slice(0, 240).trim())
    .filter((s) => s.length >= 3)
    .slice(0, count);

  if (options.length > 0) return options;
  return [await generateComment({ tweetText, lang, style, ai })];
}
