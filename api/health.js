// GET /api/health — public setup check used by the daily smoke test (.github/workflows/smoke.yml).
// Yes/no per setting, never values. The contact form always works through Formspree; these
// settings switch on the extra "lead triage" email (AI-sorted lead + drafted reply).
export default function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  const has = (k) => Boolean(process.env[k]);
  const checks = { leadEmail: has("BREVO_API_KEY") && has("ALERT_FROM_EMAIL") };
  const optional = { leadAi: has("GROQ_API_KEY"), adminDeploy: has("GITHUB_TOKEN") && has("DEPLOY_SECRET") };
  const missing = Object.entries(checks).filter(([, v]) => !v).map(([k]) => k);
  res.status(200).json({ ok: missing.length === 0, app: "portfolio", checks, optional, missing });
}
