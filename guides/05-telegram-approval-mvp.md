# Telegram Approval MVP

This fork now supports a safer MVP flow for Mode A:

```txt
Fetch tweets from configured X lists
AI generates a reply candidate
Telegram sends the candidate with buttons
You click Post or Skip
Only approved replies are posted to X
```

## Config

Add this block to `data/config.json`:

```json
{
  "approval": {
    "enabled": true,
    "mode": "telegram",
    "timeoutMs": 600000
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

## Runtime behavior

When the bot finds a candidate, Telegram will show:

- original tweet text
- author
- tweet URL
- AI reply suggestion
- Post / Skip buttons

If no button is clicked before `timeoutMs`, the candidate is skipped.
