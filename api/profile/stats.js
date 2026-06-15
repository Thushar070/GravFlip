// @license PROPRIETARY

import { DB } from '../../lib/db.js';
import { rateLimit, corsHeaders } from '../../lib/rateLimit.js';

export default async function handler(req, res) {
  const headers = corsHeaders();
  Object.entries(headers).forEach(([k, v]) => res.setHeader(k, v));

  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Rate limit: max 60 calls per IP per minute
  const { allowed } = await rateLimit(req, 'profile_stats', 60, 60);
  if (!allowed) {
    return res.status(429).json({ error: 'Too many requests' });
  }

  const { id } = req.query || {};
  if (!id) {
    return res.status(400).json({ error: 'Missing profile ID' });
  }

  const profile = await DB.getProfile(id);
  if (!profile) {
    return res.status(404).json({ error: 'Profile not found' });
  }

  // Find user's best rank on global leaderboard
  const globalScores = await DB.getTopScores(100);
  const rankIdx = globalScores.findIndex(s => s.sessionId === id || s.name === profile.username);
  const globalRank = rankIdx !== -1 ? rankIdx + 1 : null;

  const statsSummary = {
    username: profile.username,
    globalRank,
    stats: profile.stats,
    records: profile.records,
    campaign: profile.campaign,
    achievementsCount: profile.achievements.length,
    badgesCount: profile.badges.length
  };

  return res.status(200).json({ statsSummary });
}
