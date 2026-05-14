---
description: Security rules for acenta-ponudbe - prevent credential exposure
globs: "**/*"
---

# Security Rules

## .gitignore Is MANDATORY Before Any git Push

If `.gitignore` does not exist, create it BEFORE running any `git` command:

```
node_modules/
.env
output/*.pdf
data/ponudba.json
data/kickoff.txt
*.log
.takeover/
debug-*.png
```

The `.env` file contains LIVE production credentials:
- `ANTHROPIC_API_KEY` — billed per token, leaked = financial exposure
- `GROQ_API_KEY` — billed per request
- `EMAIL_USER` / `EMAIL_PASS` — Microsoft 365 account, leaked = account compromise

## Never Log Credentials

```javascript
// WRONG:
console.log('Using API key:', process.env.ANTHROPIC_API_KEY);
console.log('Email config:', process.env.EMAIL_USER, process.env.EMAIL_PASS);

// CORRECT — log presence only:
console.log('API key present:', !!process.env.ANTHROPIC_API_KEY);
```

## Never Hardcode Credentials

All credentials must come from `process.env`. Never write API keys, passwords, or email addresses directly in source code.

## .env Is Loaded via Node.js Flag

This project uses `--env-file=.env` (Node.js v22 built-in feature). No dotenv package needed. The flag is in every `npm` script in `package.json`.

## Proposal Data Is Sensitive

`data/kickoff.txt` contains client meeting transcripts — confidential business information. `data/ponudba.json` contains client company names, pricing, and contact details. Both are in `.gitignore`.

`output/*.pdf` files contain full client proposals — never commit to version control.

## Before Deploying to Railway/Render

Set all 4 environment variables in the hosting dashboard — NEVER use a `.env` file in the deployed repository. Copy values from local `.env` manually into the hosting platform's environment variable UI.
