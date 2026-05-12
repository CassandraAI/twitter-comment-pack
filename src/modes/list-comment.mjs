/**
 * Mode A — crawl one or more lists, score/filter candidates, generate reply
 * options, then either post directly or ask for Telegram approval.
 */
import { fetchListTweets, postTweet } from '../lib/twitter-http.mjs';
import { requestTelegramApproval } from '../lib/approval.mjs';
import { detectLanguage } from '../lib/language.mjs';
import { generateCommentOptions } from '../lib/ai-commenter.mjs';
import { scoreTweet } from '../lib/tweet-scoring.mjs';
import {
  alreadyCommented,
  markCommented,
  recordPostedReply,
  recordSkippedCandidate,
} from '../lib/store.mjs';
import { waitForSlot, postSleep } from '../lib/rate-limiter.mjs';
import { sendAlert } from '../lib/telegram.mjs';

export async function runListMode(cfg, log) {
  const listIds = cfg.modeA?.listIds || [];
  if (listIds.length === 0) {
    log('[mode-A] no list IDs configured; skipping');
    return;
  }

  const pool = [];
  const seen = new Set();
  for (const id of listIds) {
    try {
      const tweets = await fetchListTweets(String(id).trim(), cfg.cookiesFile, 30);
      for (const t of tweets) {
        if (!t.id || !t.fullText || t.fullText.length < 10) continue;
        if (t.isRetweet) continue;
        if (seen.has(t.id)) continue;
        if (alreadyCommented(t.id)) continue;
        const scored = scoreTweet(t, cfg);
        if (scored.shouldSkip) {
          recordSkippedCandidate({
            tweetId: t.id,
            author: t.author,
            score: scored.score,
            reason: scored.reason,
            sourceText: t.fullText,
          });
          log(`[mode-A] skip ${t.id} @${t.author} score=${scored.score}: ${scored.reason}`);
          continue;
        }
        seen.add(t.id);
        pool.push({ ...t, score: scored.score, scoreReason: scored.reason });
      }
      log(`[mode-A] list ${id}: candidate pool size now ${pool.length}`);
    } catch (e) {
      log(`[mode-A] list ${id} fetch failed: ${e.message}`);
      if (/401|403/.test(e.message)) {
        await sendAlert(cfg.telegram?.botToken, cfg.telegram?.chatId, `[twitter-comment-pack] Session expired — re-export cookies`);
        throw e;
      }
    }
  }

  pool.sort((a, b) => {
    if ((b.score || 0) !== (a.score || 0)) return (b.score || 0) - (a.score || 0);
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  const maxCandidates = Number(cfg.scoring?.maxCandidatesPerCycle) || 10;
  for (const t of pool.slice(0, maxCandidates)) {
    await waitForSlot(cfg, log);
    const langSetting = cfg.modeA?.language || 'auto';
    const lang = langSetting === 'auto' ? detectLanguage(t.fullText) : langSetting;

    let options;
    try {
      options = await generateCommentOptions({
        tweetText: t.fullText,
        lang,
        style: cfg.modeA?.stylePrompt || '',
        ai: cfg.ai,
        count: Number(cfg.approval?.optionsCount) || 3,
      });
    } catch (e) {
      log(`[mode-A] AI fail for ${t.id}: ${e.message}`);
      continue;
    }

    let approval;
    try {
      approval = await requestTelegramApproval({
        cfg,
        tweet: t,
        options,
        score: t.score,
        reason: t.scoreReason,
      }, log);
    } catch (e) {
      log(`[mode-A] approval fail for ${t.id}: ${e.message}`);
      continue;
    }
    if (approval.action !== 'post') {
      recordSkippedCandidate({
        tweetId: t.id,
        author: t.author,
        score: t.score,
        reason: `${approval.source}: ${t.scoreReason}`,
        sourceText: t.fullText,
      });
      log(`[mode-A] skipped ${t.id} @${t.author} by ${approval.source}`);
      continue;
    }

    const comment = approval.comment || options[0];
    try {
      const replyTweetId = await postTweet(comment, cfg.cookiesFile, { replyToId: t.id });
      markCommented(t.id, t.author);
      recordPostedReply({
        sourceTweetId: t.id,
        replyTweetId,
        author: t.author,
        lang,
        score: t.score,
        scoreReason: t.scoreReason,
        optionIndex: approval.optionIndex,
        replyText: comment,
        sourceText: t.fullText,
      });
      log(`[mode-A] OK reply ${t.id} @${t.author} reply=${replyTweetId} score=${t.score} lang=${lang} "${comment.slice(0, 60)}..."`);
    } catch (e) {
      log(`[mode-A] post fail ${t.id}: ${e.message}`);
      if (/RATE_LIMITED/.test(e.message)) {
        await sendAlert(cfg.telegram?.botToken, cfg.telegram?.chatId, `[twitter-comment-pack] Rate limited (${e.message})`);
        return;
      }
      continue;
    }
    await postSleep(cfg, log);
  }
}
