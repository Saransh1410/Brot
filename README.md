# ⚡ BROT — Personal Productivity Tracker

Full-stack web app. Pure Node.js, zero dependencies.

## 🚀 Quick Start

```bash
node server.js
# Open http://localhost:3000
```

## 🤖 Enable AI Mentor (Claude API)

1. Go to https://console.anthropic.com
2. Create an API key
3. Open `api_key.txt` in this folder
4. Replace the placeholder with your key:
   ```
   sk-ant-api03-xxxxxxxxxxxxxxxx
   ```
5. Restart: `node server.js`
6. The terminal will show: ✅ Claude API connected

OR use environment variable:
```bash
CLAUDE_API_KEY=sk-ant-... node server.js
```

## 📁 Structure

```
brot/
├── server.js          ← Backend + REST API + Claude AI
├── api_key.txt        ← Your Claude API key goes here
├── db.json            ← Auto-created database
└── frontend/
    ├── index.html     ← Full SPA frontend
    └── js/
        └── api.js     ← API client
```

## 🔌 API Endpoints

| Method | Route | Description |
|--------|-------|-------------|
| POST | /api/auth/register | Create account |
| POST | /api/auth/login | Login |
| GET  | /api/auth/me | Current user |
| GET  | /api/habits | List habits |
| POST | /api/habits | Create habit |
| PUT  | /api/habits/:id/complete | Toggle done |
| DELETE | /api/habits/:id | Delete |
| GET  | /api/tasks | List tasks |
| POST | /api/tasks | Create task |
| PUT  | /api/tasks/:id | Update |
| DELETE | /api/tasks/:id | Delete |
| GET  | /api/analytics | Full analytics |
| GET  | /api/sessions | Focus sessions |
| POST | /api/sessions | Log session |
| POST | /api/chat | AI Mentor chat |
