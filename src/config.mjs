import fs from 'fs';
import path from 'path';

const CONFIG_PATH = path.resolve('data/config.json');

export function loadConfig() {
  if (!fs.existsSync(CONFIG_PATH)) {
    throw new Error(
      `Missing data/config.json. Run: npm run setup`
    );
  }
  const cfg = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
  validate(cfg);
  return cfg;
}

function validate(cfg) {
  if (!cfg.cookiesFile) throw new Error('config.cookiesFile missing');
  if (!fs.existsSync(cfg.cookiesFile)) throw new Error(`Cookies file not found: ${cfg.cookiesFile}`);
  if (!cfg.mode || !['A', 'B', 'C'].includes(cfg.mode)) throw new Error('config.mode must be A, B, or C');
  if (!cfg.ai || !cfg.ai.provider || !cfg.ai.apiKey) throw new Error('config.ai.{provider,apiKey} required');
  if (!cfg.commentsPerHour) cfg.commentsPerHour = 15;
  if (!cfg.approval) cfg.approval = { enabled: true, mode: 'telegram', timeoutMs: 10 * 60 * 1000 };
  if (cfg.approval.enabled && cfg.approval.mode !== 'telegram') {
    throw new Error('config.approval.mode must be telegram when approval is enabled');
  }
  if (cfg.approval.enabled && (!cfg.telegram?.botToken || !cfg.telegram?.chatId)) {
    throw new Error('Telegram approval requires telegram.{botToken,chatId}. Disable approval only if you intentionally want auto-posting.');
  }
  if (!cfg.approval.timeoutMs) cfg.approval.timeoutMs = 10 * 60 * 1000;
}

export const CONFIG_FILE_PATH = CONFIG_PATH;
