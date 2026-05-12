# Twitter Comment Pack

Twitter/X engagement assistant for crypto + macro meme accounts.

This fork is no longer positioned as a blind auto-comment bot. The recommended MVP flow is:

```txt
Fetch tweets from X lists
Score/filter candidates
Generate 3 AI reply options
Send options to Telegram
Human clicks Post 1 / Post 2 / Post 3 / Skip
Track posted replies in SQLite
```

---

## Vietnamese Quick Start

### Requirements

- Node.js 20+
- Valid X/Twitter cookies
- Telegram bot token + chat ID
- DeepSeek API key recommended, or OpenAI/Anthropic

### Install

```bash
git clone https://github.com/CassandraAI/twitter-comment-pack.git
cd twitter-comment-pack
npm install
```

### Configure

Create your local config from the example:

```bash
cp data/config.example.json data/config.json
```

Then edit:

```txt
data/config.json
```

You need to fill:

```txt
telegram.botToken
telegram.chatId
ai.apiKey
modeA.listIds
cookiesFile / data/cookies.json
```

Cookie guide: `guides/01-get-cookies.md`  
Telegram guide: `guides/02-get-telegram-token.md`  
Approval MVP guide: `guides/05-telegram-approval-mvp.md`

### Recommended config

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
  },
  "commentsPerHour": 5
}
```

Recommended persona:

```txt
crypto macro meme account; witty, short, no shill, no links, no financial advice, no political misinformation
```

### Preflight check

After adding real keys/cookies:

```bash
npm run doctor
npm run doctor -- --network
```

`--network` sends a Telegram test message and calls the configured AI provider.

### Run

```bash
npm start
```

Telegram will show tweet candidates with buttons:

```txt
Post 1 / Post 2 / Post 3 / Skip
```

Only approved replies are posted.

### Analytics

```bash
npm run analytics
npm run analytics -- 14
npm run recent
```

Logs:

```txt
data/run.log
data/store.db
```

PowerShell real-time log:

```powershell
Get-Content data/run.log -Wait
```

---

## English Quick Start

### Requirements

- Node.js 20+
- Valid X/Twitter cookies
- Telegram bot token + chat ID
- DeepSeek API key recommended, or OpenAI/Anthropic

### Install

```bash
git clone https://github.com/CassandraAI/twitter-comment-pack.git
cd twitter-comment-pack
npm install
```

### Configure

```bash
cp data/config.example.json data/config.json
```

Fill in:

```txt
telegram.botToken
telegram.chatId
ai.apiKey
modeA.listIds
cookiesFile / data/cookies.json
```

### Run checks

```bash
npm run doctor
npm run doctor -- --network
```

### Start

```bash
npm start
```

### Safety notes

- Keep Telegram approval enabled for MVP usage.
- Start with `commentsPerHour: 5`.
- Avoid link-heavy, token-shilling, giveaway, or political manipulation replies.
- `data/config.json`, `data/cookies.json`, and `data/store.db` must stay local and must not be committed.
- Cookies expire and need to be re-exported periodically.

### Legacy modes

- Mode A: List-based candidate discovery. This is the recommended MVP path.
- Mode B: Amplify mode. Use carefully; it is more aggressive.
- Mode C: Hybrid mode. Use after Mode A is stable.

### Uninstall Windows autostart

```cmd
schtasks /Delete /TN TwitterCommentPack /F
schtasks /Delete /TN TwitterCommentPack_Startup /F
```
