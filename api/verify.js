// @license PROPRIETARY

import { ScoreValidator } from '../lib/scoreValidator.js';
import { rateLimit, corsHeaders } from '../lib/rateLimit.js';

export default async function handler(req, res) {
  const headers = corsHeaders();
  Object.entries(headers).forEach(([k, v]) => res.setHeader(k, v));

  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { allowed } = await rateLimit(req, 'verify', 10, 60);
  if (!allowed) return res.status(429).json({ error: 'Too many requests' });

  const submission = req.body;
  if (!submission || typeof submission.score !== 'number') {
    return res.status(400).json({ error: 'Invalid submission' });
  }

  const validation = await ScoreValidator.validate(submission);

  return res.status(200).json({
    valid: validation.valid,
    severity: validation.severity,
    errors: validation.errors
  });
}
