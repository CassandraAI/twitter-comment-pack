import { initStore, analyticsSummary, recentReplies } from '../src/lib/store.mjs';

function fmtDate(ts) {
  if (!ts) return '-';
  return new Date(ts).toISOString().replace('T', ' ').slice(0, 19);
}

function printSummary(days) {
  initStore('data/store.db');
  const summary = analyticsSummary(days);
  console.log(`\n=== Twitter Comment Pack Analytics (${days}d) ===\n`);
  console.log(`Posted replies : ${summary.totalPosted}`);
  console.log(`Skipped         : ${summary.totalSkipped}`);

  console.log('\nBy option:');
  if (!summary.byOption.length) {
    console.log('  No data yet.');
  } else {
    for (const row of summary.byOption) {
      const label = row.optionIndex === null || row.optionIndex === undefined ? 'auto/unknown' : `option ${Number(row.optionIndex) + 1}`;
      console.log(`  ${label.padEnd(13)} count=${row.count} avgLikes=${row.avgLikes} avgReplies=${row.avgReplies}`);
    }
  }

  console.log('\nTop replies:');
  if (!summary.top.length) {
    console.log('  No data yet.');
  } else {
    for (const row of summary.top) {
      const url = row.replyTweetId ? `https://x.com/i/web/status/${row.replyTweetId}` : `source:${row.sourceTweetId}`;
      console.log(`\n- ${fmtDate(row.postedTs)} @${row.author || 'unknown'} score=${row.score ?? '-'} opt=${row.optionIndex === null ? '-' : Number(row.optionIndex) + 1}`);
      console.log(`  likes=${row.likes} replies=${row.replies} rts=${row.retweets} quotes=${row.quotes}`);
      console.log(`  ${url}`);
      console.log(`  "${String(row.replyText || '').slice(0, 160)}"`);
    }
  }
}

function printRecent(limit) {
  initStore('data/store.db');
  const rows = recentReplies(limit);
  console.log(`\n=== Recent replies (${limit}) ===`);
  for (const row of rows) {
    const url = row.reply_tweet_id ? `https://x.com/i/web/status/${row.reply_tweet_id}` : `source:${row.source_tweet_id}`;
    console.log(`\n- ${fmtDate(row.posted_ts)} @${row.author || 'unknown'} score=${row.score ?? '-'} opt=${row.option_index === null ? '-' : Number(row.option_index) + 1}`);
    console.log(`  ${url}`);
    console.log(`  "${String(row.reply_text || '').slice(0, 180)}"`);
  }
}

const args = process.argv.slice(2);
const cmd = args[0] || 'summary';
if (cmd === 'recent') {
  printRecent(Number(args[1]) || 20);
} else {
  printSummary(Number(args[0]) || 7);
}
