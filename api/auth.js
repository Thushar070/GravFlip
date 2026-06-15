// @license PROPRIETARY

import { DB } from '../lib/db.js';
import { rateLimit, corsHeaders } from '../lib/rateLimit.js';
import { randomUUID } from 'crypto';

export default async function handler(req, res) {
  const headers = corsHeaders();
  Object.entries(headers).forEach(([k, v]) => res.setHeader(k, v));

  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Rate limit: max 10 sessions per IP per hour
  const { allowed } = await rateLimit(req, 'create_session', 10, 3600);
  if (!allowed) {
    return res.status(429).json({ error: 'Too many requests' });
  }

  const sessionId = randomUUID();
  await DB.createSession(sessionId);

  return res.status(200).json({ sessionId });
}
