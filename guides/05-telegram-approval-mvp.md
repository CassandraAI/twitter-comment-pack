# Telegram Approval MVP

This fork now supports a safer MVP flow for Mode A:

```txt
Fetch tweets from configured X lists
Score and filter candidates
AI generates 3 reply options
Telegram sends the candidate with buttons
You click Post 1 / Post 2 / Post 3 / Skip
Only approved replies are posted to X
```

## Config

Add this block to `data/config.json`:

```json
{
  "approval": {
    "enabled": true,
    "mode": "telegram",
    "timeoutMs": 600000,
    "optionsCount": 3
  },
  "scoring": {
    "minScore": 45,
    "maxCandidatesPerCycle": 10
  }
}
```

Telegram approval requires:

```json
{
  "telegram": {
    "botToken": "YOUR_TELEGRAM_BOT_TOKEN",
    "chatId": "YOUR_TELEGRAM_CHAT_ID"
  }
}
```

If `approval.enabled` is `true`, the bot will skip candidates when Telegram is missing instead of auto-posting.

## Recommended crypto/macro meme persona

Use this as `modeA.stylePrompt`:

```txt
crypto macro meme account; witty, short, no shill, no links, no financial advice, no political misinformation
```

## Recommended safe rate

For a new account, start with:

```json
"commentsPerHour": 5
```

For an account with history and normal human activity, test gradually:

```json
"commentsPerHour": 8
```

Avoid aggressive reply volume. The goal is high-quality human-approved replies, not mass comment spam.

## Scoring

`src/lib/tweet-scoring.mjs` gives higher scores to tweets related to:

- crypto: BTC, ETH, SOL, stablecoins, memecoins, DeFi, on-chain, wallets, exchanges
- macro: Fed, FOMC, CPI, inflation, rates, liquidity, DXY, USD, gold, oil
- geopolitics/policy: SEC, ETF, regulation, sanctions, election, geopolitics, war, tariffs
- market meme language: pump, dump, liquidation, rekt, FOMO, FUD, degen, charts

It blocks obvious risky/spam patterns such as:

- giveaway / claim / connect wallet
- seed phrase / private key
- follow-back spam
- external links
- Telegram/Discord group promo

Tune strictness with:

```json
"scoring": {
  "minScore": 45,
  "maxCandidatesPerCycle": 10
}
```

Raise `minScore` to 55-65 for stricter filtering. Lower it to 35-40 if too few candidates appear.

## Runtime behavior

When the bot finds a candidate, Telegram will show:

- original tweet text
- author
- tweet URL
- score and reason
- 3 AI reply suggestions
- Post 1 / Post 2 / Post 3 / Skip buttons

If no button is clicked before `timeoutMs`, the candidate is skipped.
