// api/update-portfolio.js — Vercel serverless function
// Commits updated APPS array to GitHub → triggers Vercel auto-deploy
//
// Required environment variables (set in Vercel dashboard):
//   GITHUB_TOKEN   — Personal Access Token (repo scope)
//                    github.com → Settings → Developer settings → PAT → New token
//   DEPLOY_SECRET  — Any strong string you choose (must match index.html)

const GITHUB_OWNER = process.env.GITHUB_OWNER || 'adelevictor011-glitch';
const GITHUB_REPO  = process.env.GITHUB_REPO  || 'zee-portfolio';

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-deploy-secret');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Auth check
  const secret = req.headers['x-deploy-secret'];
  if (!secret || secret !== process.env.DEPLOY_SECRET) {
    return res.status(401).json({ error: 'Unauthorized — check your DEPLOY_SECRET' });
  }

  const { apps } = req.body;
  if (!apps || !Array.isArray(apps)) {
    return res.status(400).json({ error: 'Invalid payload — expected { apps: [...] }' });
  }

  const TOKEN = process.env.GITHUB_TOKEN;
  if (!TOKEN) return res.status(500).json({ error: 'GITHUB_TOKEN not set in environment' });

  try {
    const apiBase = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}`;
    const headers = {
      Authorization: `Bearer ${TOKEN}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': '2022-11-28'
    };

    // 1. Get current apps.json SHA if it exists
    let sha = null;
    const fileRes = await fetch(`${apiBase}/contents/apps.json`, { headers });
    if (fileRes.ok) {
      const fileData = await fileRes.json();
      sha = fileData.sha;
    }

    // 2. Commit updated apps.json
    const content = Buffer.from(JSON.stringify(apps, null, 2)).toString('base64');
    const commitBody = {
      message: `chore: update portfolio apps [${new Date().toISOString().slice(0, 10)}]`,
      content,
      ...(sha ? { sha } : {})
    };

    const commitRes = await fetch(`${apiBase}/contents/apps.json`, {
      method: 'PUT',
      headers,
      body: JSON.stringify(commitBody)
    });

    if (!commitRes.ok) {
      const err = await commitRes.json();
      throw new Error(err.message || 'GitHub commit failed');
    }

    const result = await commitRes.json();
    return res.status(200).json({
      success: true,
      message: 'Committed to GitHub — Vercel will deploy in ~30 seconds.',
      commit: result.commit?.html_url
    });

  } catch (err) {
    console.error('Deploy error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
