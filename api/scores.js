// @license PROPRIETARY

import { DB } from '../lib/db.js';
import { ScoreValidator } from '../lib/scoreValidator.js';
import { rateLimit, corsHeaders } from '../lib/rateLimit.js';

export default async function handler(req, res) {
  const headers = corsHeaders();
  Object.entries(headers).forEach(([k, v]) => res.setHeader(k, v));

  if (req.method === 'OPTIONS') return res.status(200).end();

  // GET — fetch top scores
  if (req.method === 'GET') {
    const { allowed } = await rateLimit(req, 'get_scores', 30, 60);
    if (!allowed) return res.status(429).json({ error: 'Too many requests' });

    const scores = await DB.getTopScores(10);
    return res.status(200).json({ scores });
  }

  // POST — submit a new score
  if (req.method === 'POST') {
    const { allowed } = await rateLimit(req, 'submit_score', 5, 60);
    if (!allowed) return res.status(429).json({ error: 'Too many requests' });

    const sessionId = req.headers['x-session-id'];
    if (!sessionId) return res.status(401).json({ error: 'No session' });

    // Check session exists and is not banned
    const session = await DB.getSession(sessionId);
    if (!session) return res.status(401).json({ error: 'Invalid session' });
    if (session.banned) return res.status(403).json({ error: 'Session banned' });

    // Rate limit per session: max 3 submissions per minute
    const now = Date.now();
    if (session.submitCount > 3 && now - session.lastSubmit < 60000) {
      return res.status(429).json({ error: 'Submitting too fast' });
    }

    // Validate the score
    const submission = req.body;
    if (!submission || typeof submission.score !== 'number') {
      return res.status(400).json({ error: 'Invalid submission' });
    }

    const validation = await ScoreValidator.validate({ ...submission, sessionId });

    if (validation.severity === 'CHEAT') {
      // Ban the session immediately
      await DB.updateSession(sessionId, { banned: true, banReason: validation.errors });
      return res.status(403).json({ error: 'Score rejected', reason: 'validation_failed' });
    }

    if (validation.severity === 'SUSPICIOUS') {
      console.warn('SUSPICIOUS_SCORE', { sessionId, errors: validation.errors, score: submission.score });
    }

    // Score is clean — save it
    const playerName = (submission.playerName || 'Anonymous')
      .replace(/[^a-zA-Z0-9 _\-]/g, '')
      .substring(0, 16);

    await DB.addScore(playerName, Math.floor(submission.score), sessionId);
    await DB.addRecentScore(playerName, Math.floor(submission.score), submission.gameData?.mode || 'classic');
    await DB.updateSession(sessionId, {
      submitCount: (session.submitCount || 0) + 1,
      lastSubmit: now
    });

    return res.status(200).json({ success: true, rank: null });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
