// @license PROPRIETARY

/**
 * GravFlip Runner — Persistent User Profile Schema
 * 
 * Key in KV: profile:{profileId}
 */
export const INITIAL_PROFILE = (profileId, username) => ({
  id: profileId,
  username: username || 'Runner_' + Math.random().toString(36).substring(2, 8),
  created: Date.now(),
  lastActive: Date.now(),
  
  // Custom Avatar Configuration
  avatar: {
    helmet: '#ffffff', // base color
    visor: '#88ccff',  // visor glass color
    suit: '#ffffff',   // space suit color
    accent: '#00ffff', // accent glow color
    emblem: 'star'     // emblem type (star, orb, cross, delta)
  },
  
  // Overall gameplay stats
  stats: {
    totalPlayTimeMs: 0,
    totalFlips: 0,
    totalStarsCollected: 0,
    totalDistanceTraveled: 0,
    gamesPlayed: {
      classic: 0,
      mirror: 0,
      blitz: 0,
      campaign: 0
    },
    deaths: 0
  },
  
  // Personal records per mode
  records: {
    classic: { score: 0, distance: 0, date: 0 },
    mirror: { score: 0, distance: 0, date: 0 },
    blitz: { score: 0, distance: 0, date: 0 }
  },
  
  // Campaign world progress
  campaign: {
    currentWorld: 1,
    starsPerWorld: [0, 0, 0, 0, 0], // max 3 stars per world
    completed: false
  },
  
  // Unlocked achievements: [{ id: "flip_100", unlockedAt: 12345678 }]
  achievements: [],
  
  // Unlocked badges: ["Lucky Escape"]
  badges: [],
  activeBadge: null,
  
  // Friends lists
  friends: [],
  friendRequestsSent: [],
  friendRequestsReceived: []
});
