// @license PROPRIETARY

import { DB } from '../../lib/db.js';
import { ScoreValidator } from '../../lib/scoreValidator.js';
import { rateLimit, corsHeaders } from '../../lib/rateLimit.js';

export default async function handler(req, res) {
  const headers = corsHeaders();
  Object.entries(headers).forEach(([k, v]) => res.setHeader(k, v));

  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Rate limit: max 5 submissions per IP per minute
  const { allowed } = await rateLimit(req, 'submit_daily_score', 5, 60);
  if (!allowed) {
    return res.status(429).json({ error: 'Too many requests' });
  }

  const sessionId = req.headers['x-session-id'];
  if (!sessionId) {
    return res.status(401).json({ error: 'No session' });
  }

  // Verify session exists and is not banned
  const session = await DB.getSession(sessionId);
  if (!session) return res.status(401).json({ error: 'Invalid session' });
  if (session.banned) return res.status(403).json({ error: 'Session banned' });

  // Rate limit per session: max 3 submissions per minute
  const now = Date.now();
  if (session.submitCount > 3 && now - session.lastSubmit < 60000) {
    return res.status(429).json({ error: 'Submitting too fast' });
  }

  const { score, playerName, token, gameData, date } = req.body || {};
  if (typeof score !== 'number' || !date) {
    return res.status(400).json({ error: 'Invalid submission' });
  }

  // Validate date formatting (YYYY-MM-DD)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ error: 'Invalid date format' });
  }

  // Run anti-cheat physics validation
  const validation = await ScoreValidator.validate({ score, sessionId, token, gameData });

  if (validation.severity === 'CHEAT') {
    await DB.updateSession(sessionId, { banned: true, banReason: validation.errors });
    return res.status(403).json({ error: 'Score rejected', reason: 'validation_failed' });
  }

  if (validation.severity === 'SUSPICIOUS') {
    console.warn('SUSPICIOUS_DAILY_SCORE', { sessionId, errors: validation.errors, score });
  }

  // Sanitize player name
  const cleanName = (playerName || 'Anonymous')
    .replace(/[^a-zA-Z0-9 _\-]/g, '')
    .substring(0, 16);

  // Save score to daily leaderboard
  await DB.addDailyScore(cleanName, Math.floor(score), sessionId, date);
  await DB.addRecentScore(cleanName, Math.floor(score), 'daily');

  // Update session metadata
  await DB.updateSession(sessionId, {
    submitCount: (session.submitCount || 0) + 1,
    lastSubmit: now
  });

  return res.status(200).json({ success: true });
}
