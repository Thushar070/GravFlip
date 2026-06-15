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

  // Rate limit: max 60 requests per IP per minute
  const { allowed } = await rateLimit(req, 'get_recent_scores', 60, 60);
  if (!allowed) return res.status(429).json({ error: 'Too many requests' });

  const scores = await DB.getRecentScores(15);
  return res.status(200).json({ scores });
}
