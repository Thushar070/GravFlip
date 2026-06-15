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

  // Rate limit: max 30 leaderboard requests per IP per minute
  const { allowed } = await rateLimit(req, 'friends_leaderboard', 30, 60);
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

  const participants = [id, ...(profile.friends || [])];
  
  const entries = [];
  for (const pId of participants) {
    const p = await DB.getProfile(pId);
    if (p) {
      entries.push({
        id: p.id,
        name: p.username,
        avatar: p.avatar,
        activeBadge: p.activeBadge,
        score: p.records?.classic?.score || 0
      });
    }
  }

  entries.sort((a, b) => b.score - a.score);

  return res.status(200).json({ scores: entries });
}
