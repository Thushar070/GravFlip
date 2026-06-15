// @license PROPRIETARY

export const BADGES = [
  {
    id: 'lucky_escape',
    name: 'Lucky Escape',
    description: 'Survive an obstacle within 5 pixels of clearance (close call)'
  },
  {
    id: 'phantom_challenger',
    name: 'Phantom Challenger',
    description: 'Reach a score of 1,500+ in Classic/Blitz without collecting any stars'
  },
  {
    id: 'speed_demon',
    name: 'Speed Demon',
    description: 'Reach a speed of 7.5+ in Classic/Blitz without taking any shield damage'
  },
  {
    id: 'flawless_run',
    name: 'Flawless Run',
    description: 'Complete any Campaign world with a perfect 3-star rating'
  },
  {
    id: 'patient_runner',
    name: 'Patient Runner',
    description: 'Survive for 45+ seconds with fewer than 8 gravity flips'
  },
  {
    id: 'untouchable',
    name: 'Untouchable',
    description: 'Reach a score of 3,000+ in Classic/Blitz without taking any damage'
  }
];

export function checkBadges(sessionState) {
  const newlyUnlocked = [];

  // 1. Lucky Escape: check if they had a close call during the run
  if (sessionState.closeCalls > 0) {
    newlyUnlocked.push('lucky_escape');
  }

  // 2. Phantom Challenger: 1500+ score and 0 stars in Classic or Blitz
  if (
    (sessionState.mode === 'classic' || sessionState.mode === 'blitz') &&
    sessionState.score >= 1500 &&
    sessionState.starsCollected === 0
  ) {
    newlyUnlocked.push('phantom_challenger');
  }

  // 3. Speed Demon: speed >= 7.5 and 0 damage taken
  if (
    (sessionState.mode === 'classic' || sessionState.mode === 'blitz') &&
    sessionState.finalSpeed >= 7.5 &&
    (sessionState.damageTaken || 0) === 0
  ) {
    newlyUnlocked.push('speed_demon');
  }

  // 4. Flawless Run: campaign mode with 3 stars earned
  if (
    sessionState.mode === 'campaign' &&
    (sessionState.starsEarned || 0) === 3
  ) {
    newlyUnlocked.push('flawless_run');
  }

  // 5. Patient Runner: survive >= 45 seconds and < 8 flips
  if (
    (sessionState.timeSurvivedMs || 0) >= 45000 &&
    (sessionState.flips || 0) < 8
  ) {
    newlyUnlocked.push('patient_runner');
  }

  // 6. Untouchable: 3000+ score and 0 damage taken
  if (
    (sessionState.mode === 'classic' || sessionState.mode === 'blitz') &&
    sessionState.score >= 3000 &&
    (sessionState.damageTaken || 0) === 0
  ) {
    newlyUnlocked.push('untouchable');
  }

  return newlyUnlocked;
}
