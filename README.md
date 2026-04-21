# Zee Portfolio

Personal portfolio — built with vanilla HTML, CSS, JS. Deployed on Vercel.

## Project Structure

```
zee-portfolio/
├── index.html          # Main portfolio page
├── public/
│   └── images/         # App screenshots + portrait
├── api/
│   └── update-portfolio.js  # Serverless: GitHub auto-deploy from admin panel
├── vercel.json         # Vercel config
└── apps.json           # App data (updated by admin panel → auto-deploys)
```

## Setup

### 1. Formspree (contact form)
1. Sign up at formspree.io
2. Create a new form → copy endpoint URL
3. In `index.html`, find `FORMSPREE_ENDPOINT` and replace the placeholder

### 2. GitHub Auto-Deploy from Admin Panel
**Vercel Environment Variables** (set in Vercel dashboard → Project → Settings → Environment Variables):

| Variable | Value |
|---|---|
| `GITHUB_TOKEN` | Your GitHub Personal Access Token (Settings → Developer Settings → PAT → repo scope) |
| `GITHUB_OWNER` | `adelevictor011-glitch` |
| `GITHUB_REPO` | `zee-portfolio` |
| `DEPLOY_SECRET` | Any strong random string — also paste into `index.html` in the `DEPLOY_SECRET` constant |

### 3. Admin Panel Password
Password is SHA-1 hashed. Current password: ask Zee.
To change: generate SHA-1 at sha1.online and update `ADMIN_HASH` in `index.html`.

## Deploy
Push to GitHub → Vercel auto-deploys on every commit.
