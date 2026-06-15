// @license PROPRIETARY
import { BehaviorAnalyzer } from './behaviorAnalyzer.js';

const GAME_SECRET = process.env.GAME_SECRET;

// Physics constants (must match frontend exactly)
const PHYSICS = {
  INITIAL_SPEED: 3,
  MAX_SPEED: 8,
  SPEED_INCREMENT: 0.0005,
  STAR_POINTS: 50,
  BASE_SCORE_RATE: 0.5,
  MAX_FRAMES_PER_SECOND: 65,
  MIN_FRAMES_PER_SECOND: 55
};

export const ScoreValidator = {
  async generateToken(score, sessionId, gameData) {
    const payload = JSON.stringify({ score, sessionId, gameData });
    const msgBuffer = new TextEncoder().encode(payload + GAME_SECRET);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  },

  async validate(submission) {
    const {
      score,
      sessionId,
      token,
      gameData
    } = submission;

    if (!gameData) {
      return { valid: false, errors: ['MISSING_GAME_DATA'], severity: 'CHEAT' };
    }

    const {
      frameCount,
      starsCollected,
      survivalTimeMs,
      finalSpeed,
      mode,
      world
    } = gameData;

    const errors = [];

    // 1. TOKEN INTEGRITY CHECK
    const expectedToken = await this.generateToken(score, sessionId, gameData);
    if (token !== expectedToken) {
      errors.push('INVALID_TOKEN');
      return { valid: false, errors, severity: 'CHEAT' };
    }

    // 2. PHYSICS PLAUSIBILITY CHECK
    const theoreticalMaxScoreFromTime = (survivalTimeMs / 1000) * 60 * PHYSICS.BASE_SCORE_RATE;
    const theoreticalMaxScoreFromStars = starsCollected * PHYSICS.STAR_POINTS * 4;
    const theoreticalMaxTotal = theoreticalMaxScoreFromTime + theoreticalMaxScoreFromStars;

    if (score > theoreticalMaxTotal * 1.05) {
      errors.push('SCORE_TOO_HIGH_FOR_TIME');
    }

    // 3. FRAME COUNT PLAUSIBILITY
    const expectedFrames = (survivalTimeMs / 1000) * 60;
    const frameTolerance = (survivalTimeMs / 1000) * 10;
    if (Math.abs(frameCount - expectedFrames) > frameTolerance) {
      errors.push('FRAME_COUNT_MISMATCH');
    }

    // 4. STAR COLLECTION RATE CHECK
    const maxPossibleStars = gameData.modifier === 'starless' ? 0 : Math.floor(survivalTimeMs / 400);
    if (starsCollected > maxPossibleStars) {
      errors.push('TOO_MANY_STARS');
    }

    // 5. SPEED PLAUSIBILITY CHECK
    let speedIncrement = PHYSICS.SPEED_INCREMENT;
    if (gameData.modifier === 'speed_surge') {
      speedIncrement = PHYSICS.SPEED_INCREMENT * 2;
    }
    const expectedSpeed = Math.min(
      PHYSICS.MAX_SPEED,
      PHYSICS.INITIAL_SPEED + frameCount * speedIncrement
    );
    if (finalSpeed > expectedSpeed * 1.02) {
      errors.push('IMPOSSIBLE_SPEED');
    }

    // 6. SURVIVAL TIME vs SCORE CORRELATION
    const minExpectedScore = (survivalTimeMs / 1000) * 60 * PHYSICS.BASE_SCORE_RATE * 0.9;
    if (score < minExpectedScore) {
      errors.push('SCORE_TOO_LOW_FOR_TIME');
    }

    // 7. MODE-SPECIFIC CHECKS
    if (mode === 'blitz' && finalSpeed < 5) {
      errors.push('BLITZ_SPEED_TOO_LOW');
    }

    // 8. BEHAVIORAL ANALYSIS
    const behavior = BehaviorAnalyzer.analyze(gameData, gameData.replay || null);
    if (behavior.anomalies.length > 0) {
      errors.push(...behavior.anomalies);
    }

    // 9. TIMING TAMPERING CHECK
    if (gameData.timingTampered) {
      errors.push('TIMING_TAMPERED');
    }

    const severity = errors.includes('INVALID_TOKEN') ||
                     errors.includes('SCORE_TOO_HIGH_FOR_TIME') ||
                     errors.includes('TOO_MANY_STARS') ||
                     errors.includes('IMPOSSIBLE_DISTANCE') ||
                     errors.includes('REPLAY_OUT_OF_BOUNDS') ||
                     errors.includes('TIMING_TAMPERED')
      ? 'CHEAT'
      : errors.length > 0 ? 'SUSPICIOUS' : 'CLEAN';

    return { valid: severity === 'CLEAN', errors, severity };
  }
};
