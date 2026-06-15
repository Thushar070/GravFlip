// @license PROPRIETARY

import { DB } from '../../lib/db.js';
import { rateLimit, corsHeaders } from '../../lib/rateLimit.js';
import { randomUUID } from 'crypto';

export default async function handler(req, res) {
  const headers = corsHeaders();
  Object.entries(headers).forEach(([k, v]) => res.setHeader(k, v));

  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Rate limit: max 5 profile creations per IP per hour
  const { allowed } = await rateLimit(req, 'create_profile', 5, 3600);
  if (!allowed) {
    return res.status(429).json({ error: 'Too many requests' });
  }

  const { username } = req.body || {};
  
  // Sanitize username
  const cleanUsername = (username || '')
    .replace(/[^a-zA-Z0-9 _\-]/g, '')
    .trim()
    .substring(0, 16);

  const profileId = randomUUID();
  const profile = await DB.createProfile(profileId, cleanUsername || null);

  if (!profile) {
    return res.status(500).json({ error: 'Failed to create profile' });
  }

  return res.status(200).json({ profile });
}
