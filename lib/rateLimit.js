// @license PROPRIETARY

import { DB } from './db.js';

export async function rateLimit(req, action, limit, windowSec) {
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim()
           || req.headers['x-real-ip']
           || '0.0.0.0';

  const allowed = await DB.checkRateLimit(ip, action, limit, windowSec);
  return { allowed, ip };
}

export function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : 'http://localhost:3000',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Session-ID',
    'Content-Type': 'application/json'
  };
}
