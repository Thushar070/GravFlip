// @license PROPRIETARY

import { corsHeaders, rateLimit } from '../../lib/rateLimit.js';

const MODIFIERS = [
  { id: 'starless', name: 'STARLESS VOID', desc: 'No stars spawn in this run. Score relies purely on survival distance.' },
  { id: 'low_gravity', name: 'LOW GRAVITY', desc: 'Gravity is reduced by 30%. Floats feel airy, timing is elongated.' },
  { id: 'speed_surge', name: 'SPEED SURGE', desc: 'Game speed rises twice as fast. Reaction speed is crucial!' },
  { id: 'saw_heavy', name: 'SAW STORM', desc: 'Saw blade obstacles are twice as likely to spawn.' }
];

const MODES = ['classic', 'blitz', 'mirror'];

export default async function handler(req, res) {
  const headers = corsHeaders();
  Object.entries(headers).forEach(([k, v]) => res.setHeader(k, v));

  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Rate limit: max 60 calls per IP per minute
  const { allowed } = await rateLimit(req, 'daily_today', 60, 60);
  if (!allowed) {
    return res.status(429).json({ error: 'Too many requests' });
  }

  // Generate date string for today (UTC)
  const todayStr = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  
  // Deterministic hashing of the date string
  let hash = 0;
  for (let i = 0; i < todayStr.length; i++) {
    hash = todayStr.charCodeAt(i) + ((hash << 5) - hash);
  }
  hash = Math.abs(hash);

  const modeIdx = hash % MODES.length;
  const modIdx = hash % MODIFIERS.length;

  return res.status(200).json({
    date: todayStr,
    seed: hash,
    mode: MODES[modeIdx],
    modifier: MODIFIERS[modIdx].id,
    modifierName: MODIFIERS[modIdx].name,
    modifierDesc: MODIFIERS[modIdx].desc
  });
}
