// @license PROPRIETARY

export const ACHIEVEMENTS = [
  // Play count achievements
  {
    id: 'first_step',
    name: 'First Step',
    description: 'Play your first game of GravFlip',
    tier: 'bronze',
    check: (profile) => {
      const g = profile.stats?.gamesPlayed || {};
      return (g.classic + g.mirror + g.blitz + g.campaign) >= 1;
    }
  },
  {
    id: 'runner_recruit',
    name: 'Runner Recruit',
    description: 'Play 50 games total',
    tier: 'silver',
    check: (profile) => {
      const g = profile.stats?.gamesPlayed || {};
      return (g.classic + g.mirror + g.blitz + g.campaign) >= 50;
    }
  },
  {
    id: 'addicted_runner',
    name: 'Addicted Runner',
    description: 'Play 200 games total',
    tier: 'gold',
    check: (profile) => {
      const g = profile.stats?.gamesPlayed || {};
      return (g.classic + g.mirror + g.blitz + g.campaign) >= 200;
    }
  },

  // Flip achievements
  {
    id: 'flip_100',
    name: 'Gravity Dabbler',
    description: 'Perform 100 gravity flips',
    tier: 'bronze',
    check: (profile) => (profile.stats?.totalFlips || 0) >= 100
  },
  {
    id: 'flip_1000',
    name: 'Flipping Master',
    description: 'Perform 1,000 gravity flips',
    tier: 'silver',
    check: (profile) => (profile.stats?.totalFlips || 0) >= 1000
  },
  {
    id: 'flip_5000',
    name: 'Anti-Gravity Legend',
    description: 'Perform 5,000 gravity flips',
    tier: 'gold',
    check: (profile) => (profile.stats?.totalFlips || 0) >= 5000
  },

  // Star achievements
  {
    id: 'star_hunter',
    name: 'Star Hunter',
    description: 'Collect 50 stars total',
    tier: 'bronze',
    check: (profile) => (profile.stats?.totalStarsCollected || 0) >= 50
  },
  {
    id: 'star_hoarder',
    name: 'Star Hoarder',
    description: 'Collect 500 stars total',
    tier: 'silver',
    check: (profile) => (profile.stats?.totalStarsCollected || 0) >= 500
  },
  {
    id: 'star_legend',
    name: 'Nebula Wealthy',
    description: 'Collect 2,500 stars total',
    tier: 'gold',
    check: (profile) => (profile.stats?.totalStarsCollected || 0) >= 2500
  },

  // High score achievements
  {
    id: 'classic_1000',
    name: 'Survivalist',
    description: 'Reach a score of 1,000 in Classic Mode',
    tier: 'bronze',
    check: (profile) => (profile.records?.classic?.score || 0) >= 1000
  },
  {
    id: 'classic_5000',
    name: 'Hyper-Runner',
    description: 'Reach a score of 5,000 in Classic Mode',
    tier: 'silver',
    check: (profile) => (profile.records?.classic?.score || 0) >= 5000
  },
  {
    id: 'classic_10000',
    name: 'Cosmic Pioneer',
    description: 'Reach a score of 10,000 in Classic Mode',
    tier: 'gold',
    check: (profile) => (profile.records?.classic?.score || 0) >= 10000
  },

  // Distance achievements
  {
    id: 'walker',
    name: 'Space Walker',
    description: 'Travel a total distance of 5,000 units',
    tier: 'bronze',
    check: (profile) => (profile.stats?.totalDistanceTraveled || 0) >= 5000
  },
  {
    id: 'runner',
    name: 'Light Runner',
    description: 'Travel a total distance of 50,000 units',
    tier: 'silver',
    check: (profile) => (profile.stats?.totalDistanceTraveled || 0) >= 50000
  },
  {
    id: 'voyager',
    name: 'Grand Voyager',
    description: 'Travel a total distance of 250,000 units',
    tier: 'gold',
    check: (profile) => (profile.stats?.totalDistanceTraveled || 0) >= 250000
  },

  // Campaign achievements
  {
    id: 'world_1_cleared',
    name: 'Escape Orbit',
    description: 'Complete Campaign World 1',
    tier: 'bronze',
    check: (profile) => (profile.campaign?.currentWorld || 1) > 1 || (profile.campaign?.completed || false)
  },
  {
    id: 'world_3_cleared',
    name: 'Deep Space',
    description: 'Complete Campaign World 3',
    tier: 'silver',
    check: (profile) => (profile.campaign?.currentWorld || 1) > 3 || (profile.campaign?.completed || false)
  },
  {
    id: 'campaign_hero',
    name: 'Galaxy Savior',
    description: 'Complete the entire Campaign mode',
    tier: 'gold',
    check: (profile) => profile.campaign?.completed || false
  },
  {
    id: 'perfect_stars',
    name: 'Star Perfecter',
    description: 'Collect all 3 stars in every Campaign world',
    tier: 'gold',
    check: (profile) => {
      const stars = profile.campaign?.starsPerWorld || [];
      if (stars.length < 5) return false;
      return stars.reduce((sum, s) => sum + s, 0) >= 15;
    }
  },

  // Ultimate platinum achievement
  {
    id: 'gravflip_god',
    name: 'GravFlip Overlord',
    description: 'Unlock all 19 other achievements',
    tier: 'platinum',
    check: (profile) => {
      const currentIds = new Set((profile.achievements || []).map(a => a.id));
      // Exclude gravflip_god itself
      const otherAchievementIds = ACHIEVEMENTS.filter(a => a.id !== 'gravflip_god').map(a => a.id);
      return otherAchievementIds.every(id => currentIds.has(id));
    }
  }
];

export function checkAchievements(profile) {
  const currentIds = new Set((profile.achievements || []).map(a => a.id));
  const newlyUnlocked = [];

  for (const ach of ACHIEVEMENTS) {
    if (!currentIds.has(ach.id)) {
      if (ach.check(profile)) {
        newlyUnlocked.push({
          id: ach.id,
          unlockedAt: Date.now()
        });
      }
    }
  }

  return newlyUnlocked;
}
