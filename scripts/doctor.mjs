import fs from 'fs';
import { loadConfig } from '../src/config.mjs';
import { sendTelegramMessage } from '../src/lib/telegram.mjs';
import { generateCommentOptions } from '../src/lib/ai-commenter.mjs';

function ok(msg) {
  console.log(`✅ ${msg}`);
}

function warn(msg) {
  console.log(`⚠️  ${msg}`);
}

function fail(msg) {
  console.log(`❌ ${msg}`);
  process.exitCode = 1;
}

async function main() {
  console.log('\n=== Twitter Comment Pack Doctor ===\n');

  let cfg;
  try {
    cfg = loadConfig();
    ok('Loaded data/config.json');
  } catch (e) {
    fail(e.message);
    return;
  }

  if (fs.existsSync(cfg.cookiesFile)) ok(`Cookies file exists: ${cfg.cookiesFile}`);
  else fail(`Cookies file missing: ${cfg.cookiesFile}`);

  if (cfg.mode === 'A') ok('Mode A selected');
  else warn(`Mode ${cfg.mode} selected. Telegram approval MVP is currently strongest for Mode A.`);

  if (cfg.modeA?.listIds?.length) ok(`Mode A list IDs: ${cfg.modeA.listIds.length}`);
  else warn('No modeA.listIds configured. Bot will skip Mode A.');

  if (cfg.approval?.enabled) {
    ok('Telegram approval enabled');
    if (cfg.telegram?.botToken && cfg.telegram?.chatId) ok('Telegram token/chatId configured');
    else fail('Telegram approval enabled but telegram.botToken/chatId missing');
  } else {
    warn('Telegram approval disabled. Bot may auto-post depending on mode.');
  }

  if (cfg.ai?.provider && cfg.ai?.apiKey) ok(`AI configured: ${cfg.ai.provider}`);
  else fail('AI provider/apiKey missing');

  const doNetwork = process.argv.includes('--network');
  if (!doNetwork) {
    console.log('\nNetwork tests skipped. Run `npm run doctor -- --network` after adding real API keys.');
    return;
  }

  if (cfg.telegram?.botToken && cfg.telegram?.chatId) {
    try {
      await sendTelegramMessage(cfg.telegram.botToken, cfg.telegram.chatId, {
        text: '[twitter-comment-pack] Doctor test: Telegram is connected.',
      });
      ok('Telegram sendMessage works');
    } catch (e) {
      fail(`Telegram test failed: ${e.message}`);
    }
  }

  try {
    const options = await generateCommentOptions({
      tweetText: 'Bitcoin traders watching CPI and Fed headlines like it is the final boss.',
      lang: 'en',
      style: cfg.modeA?.stylePrompt || '',
      ai: cfg.ai,
      count: 3,
    });
    if (options.length) {
      ok(`AI test generated ${options.length} option(s)`);
      options.forEach((opt, i) => console.log(`  ${i + 1}. ${opt}`));
    } else {
      fail('AI test returned no options');
    }
  } catch (e) {
    fail(`AI test failed: ${e.message}`);
  }
}

main().catch((e) => {
  fail(e.stack || e.message);
});
