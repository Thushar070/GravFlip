// @license PROPRIETARY

import { DB } from '../../lib/db.js';
import { rateLimit, corsHeaders } from '../../lib/rateLimit.js';

export default async function handler(req, res) {
  const headers = corsHeaders();
  Object.entries(headers).forEach(([k, v]) => res.setHeader(k, v));

  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Rate limit: max 20 updates per IP per minute
  const { allowed } = await rateLimit(req, 'update_profile', 20, 60);
  if (!allowed) {
    return res.status(429).json({ error: 'Too many requests' });
  }

  const { id, username, avatar, stats, records, campaign, achievements, badges, activeBadge } = req.body || {};
  if (!id) {
    return res.status(400).json({ error: 'Missing profile ID' });
  }

  const existingProfile = await DB.getProfile(id);
  if (!existingProfile) {
    return res.status(404).json({ error: 'Profile not found' });
  }

  const updateData = { lastActive: Date.now() };

  // Username sanitization
  if (username !== undefined) {
    updateData.username = String(username)
      .replace(/[^a-zA-Z0-9 _\-]/g, '')
      .trim()
      .substring(0, 16) || existingProfile.username;
  }

  // Avatar sanitization
  if (avatar) {
    updateData.avatar = {
      ...existingProfile.avatar,
      ...Object.fromEntries(
        Object.entries(avatar).filter(([k, v]) => 
          ['helmet', 'visor', 'suit', 'accent', 'emblem'].includes(k) &&
          typeof v === 'string' &&
          (v.startsWith('#') || v.length <= 16)
        )
      )
    };
  }

  // Stats sanitization
  if (stats) {
    updateData.stats = {
      ...existingProfile.stats,
      ...Object.fromEntries(
        Object.entries(stats).filter(([k, v]) => 
          ['totalPlayTimeMs', 'totalFlips', 'totalStarsCollected', 'totalDistanceTraveled', 'deaths'].includes(k) &&
          typeof v === 'number'
        )
      )
    };
    if (stats.gamesPlayed) {
      updateData.stats.gamesPlayed = {
        ...existingProfile.stats.gamesPlayed,
        ...Object.fromEntries(
          Object.entries(stats.gamesPlayed).filter(([k, v]) => 
            ['classic', 'mirror', 'blitz', 'campaign'].includes(k) &&
            typeof v === 'number'
          )
        )
      };
    }
  }

  // Records sanitization
  if (records) {
    updateData.records = {
      ...existingProfile.records,
      ...Object.fromEntries(
        Object.entries(records).filter(([k, v]) => 
          ['classic', 'mirror', 'blitz'].includes(k) &&
          typeof v === 'object' && v !== null &&
          typeof v.score === 'number' &&
          typeof v.distance === 'number'
        ).map(([k, v]) => [k, {
          score: Math.floor(v.score),
          distance: Math.floor(v.distance),
          date: Date.now()
        }])
      )
    };
  }

  // Campaign sanitization
  if (campaign) {
    updateData.campaign = {
      ...existingProfile.campaign,
      ...Object.fromEntries(
        Object.entries(campaign).filter(([k, v]) => 
          ['currentWorld', 'completed'].includes(k)
        )
      )
    };
    if (Array.isArray(campaign.starsPerWorld)) {
      updateData.campaign.starsPerWorld = campaign.starsPerWorld
        .slice(0, 5)
        .map(v => Math.min(3, Math.max(0, Number(v) || 0)));
    }
  }

  // Achievements sanitization
  if (Array.isArray(achievements)) {
    updateData.achievements = achievements.filter(a => 
      a && typeof a.id === 'string' && typeof a.unlockedAt === 'number'
    );
  }

  // Badges sanitization
  if (Array.isArray(badges)) {
    updateData.badges = badges.filter(b => typeof b === 'string').slice(0, 50);
  }

  // Active badge sanitization
  if (activeBadge !== undefined) {
    updateData.activeBadge = activeBadge ? String(activeBadge).substring(0, 32) : null;
  }

  const updatedProfile = await DB.updateProfile(id, updateData);
  return res.status(200).json({ profile: updatedProfile });
}
