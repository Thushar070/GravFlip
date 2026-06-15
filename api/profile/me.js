// @license PROPRIETARY

import { DB } from '../../lib/db.js';
import { rateLimit, corsHeaders } from '../../lib/rateLimit.js';
import { randomUUID } from 'crypto';

export default async function handler(req, res) {
  const headers = corsHeaders();
  Object.entries(headers).forEach(([k, v]) => res.setHeader(k, v));

  if (req.method === 'OPTIONS') return res.status(200).end();

  // Rate limit: max 30 requests per IP per minute
  const { allowed } = await rateLimit(req, 'profile_me', 30, 60);
  if (!allowed) {
    return res.status(429).json({ error: 'Too many requests' });
  }

  const profileId = req.headers['x-profile-id'] || req.query?.id || req.body?.id;
  
  if (profileId && typeof profileId === 'string' && profileId.length > 5) {
    const profile = await DB.getProfile(profileId);
    if (profile) {
      const updated = await DB.updateProfile(profileId, { lastActive: Date.now() });
      return res.status(200).json({ profile: updated });
    }
  }

  // Auto-generate profile if not found/provided
  const newProfileId = randomUUID();
  const profile = await DB.createProfile(newProfileId, null);

  return res.status(200).json({ profile });
}
