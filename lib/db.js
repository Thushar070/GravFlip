// @license PROPRIETARY

import { kv } from '@vercel/kv';
import { INITIAL_PROFILE } from './profileSchema.js';

export const DB = {
  // Leaderboard: sorted set by score (descending)
  async addScore(playerName, score, sessionId) {
    const key = 'leaderboard:global';
    const entry = JSON.stringify({ name: playerName, score, sessionId, ts: Date.now() });
    await kv.zadd(key, { score, member: entry });
    // Keep only top 100
    await kv.zremrangebyrank(key, 0, -101);
  },

  async getTopScores(limit = 10) {
    const key = 'leaderboard:global';
    const raw = await kv.zrange(key, 0, limit - 1, { rev: true, withScores: true });
    if (!raw || raw.length === 0) return [];
    // zrange with withScores returns alternating [member, score, member, score, ...]
    const results = [];
    for (let i = 0; i < raw.length; i += 2) {
      const member = raw[i];
      const score = raw[i + 1];
      try {
        const parsed = typeof member === 'string' ? JSON.parse(member) : member;
        results.push({ ...parsed, score: Number(score) });
      } catch (e) {
        results.push({ name: 'Unknown', score: Number(score) });
      }
    }
    return results;
  },

  // Session tracking (anonymous, no login needed)
  async createSession(sessionId) {
    await kv.set(`session:${sessionId}`, {
      created: Date.now(),
      submitCount: 0,
      lastSubmit: 0,
      banned: false
    }, { ex: 86400 }); // 24h TTL
  },

  async getSession(sessionId) {
    return await kv.get(`session:${sessionId}`);
  },

  async updateSession(sessionId, data) {
    const existing = await kv.get(`session:${sessionId}`);
    if (!existing) return false;
    await kv.set(`session:${sessionId}`, { ...existing, ...data }, { ex: 86400 });
    return true;
  },

  // Rate limiting: track API calls per IP
  async checkRateLimit(ip, action, limit, windowSec) {
    const key = `ratelimit:${action}:${ip}`;
    const count = await kv.incr(key);
    if (count === 1) await kv.expire(key, windowSec);
    return count <= limit;
  },

  // Persistent User Profiles
  async createProfile(profileId, username) {
    const key = `profile:${profileId}`;
    const exists = await kv.exists(key);
    if (exists) return false;
    const newProfile = INITIAL_PROFILE(profileId, username);
    await kv.set(key, newProfile);
    
    // Index username for lookups
    const usernameKey = `username:${newProfile.username.toLowerCase()}`;
    await kv.set(usernameKey, profileId);
    
    return newProfile;
  },

  async getProfile(profileId) {
    return await kv.get(`profile:${profileId}`);
  },

  async getProfileIdByUsername(username) {
    if (!username) return null;
    return await kv.get(`username:${username.toLowerCase()}`);
  },

  async updateProfile(profileId, data) {
    const key = `profile:${profileId}`;
    const existing = await kv.get(key);
    if (!existing) return false;
    
    const oldUsername = existing.username;
    const updated = { ...existing, ...data };
    
    // If username changed, update index and verify uniqueness
    if (data.username && data.username.toLowerCase() !== oldUsername.toLowerCase()) {
      const oldUsernameKey = `username:${oldUsername.toLowerCase()}`;
      const newUsernameKey = `username:${data.username.toLowerCase()}`;
      
      const taken = await kv.exists(newUsernameKey);
      if (taken) {
        // Force revert back to old username if taken
        updated.username = oldUsername;
      } else {
        await kv.del(oldUsernameKey);
        await kv.set(newUsernameKey, profileId);
      }
    }
    
    await kv.set(key, updated);
    return updated;
  }
};
