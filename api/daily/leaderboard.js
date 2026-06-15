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

  // Rate limit: max 60 leaderboard requests per IP per minute
  const { allowed } = await rateLimit(req, 'get_daily_leaderboard', 60, 60);
  if (!allowed) {
    return res.status(429).json({ error: 'Too many requests' });
  }

  const { date } = req.query || {};
  
  // Default to today UTC if date parameter is missing
  const queryDate = date || new Date().toISOString().split('T')[0];

  if (!/^\d{4}-\d{2}-\d{2}$/.test(queryDate)) {
    return res.status(400).json({ error: 'Invalid date format' });
  }

  const scores = await DB.getDailyScores(queryDate, 50); // get top 50 scores
  return res.status(200).json({ scores });
}
