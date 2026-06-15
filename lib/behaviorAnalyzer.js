// @license PROPRIETARY

export const BehaviorAnalyzer = {
  analyze(gameData, replay) {
    const anomalies = [];
    let anomalyScore = 0;

    const {
      frameCount,
      starsCollected,
      survivalTimeMs,
      finalSpeed,
      distanceTraveled,
      mode,
      modifier
    } = gameData;

    // 1. Frame time analysis (check if frame duration is normal)
    if (frameCount > 0 && survivalTimeMs > 0) {
      const avgFrameTimeMs = survivalTimeMs / frameCount;
      // Normal frame rate is 30-120fps -> frame time 8.3ms to 33.3ms.
      // If average frame time is < 12ms (e.g. game sped up) or > 45ms, trigger warning.
      if (avgFrameTimeMs < 12) {
        anomalies.push('FPS_TOO_HIGH');
        anomalyScore += 40;
      } else if (avgFrameTimeMs > 50) {
        anomalies.push('FPS_TOO_LOW');
        anomalyScore += 15;
      }
    }

    // 2. Distance vs Speed/Time consistency
    // If distance is far greater than max speed * duration, it's a physics cheat.
    if (survivalTimeMs > 0 && distanceTraveled > 0) {
      const durationSec = survivalTimeMs / 1000;
      const maxPossibleDistance = finalSpeed * 60 * durationSec * 1.5;
      if (distanceTraveled > maxPossibleDistance) {
        anomalies.push('IMPOSSIBLE_DISTANCE');
        anomalyScore += 60;
      }
    }

    // 3. Replay analysis (if replay is submitted)
    if (replay && Array.isArray(replay) && replay.length > 5) {
      // Check for exact coordinate repetitions (indicates bot or static injection)
      let identicalCount = 0;
      for (let i = 1; i < replay.length; i++) {
        if (replay[i].y === replay[i - 1].y && replay[i].g === replay[i - 1].g) {
          identicalCount++;
        }
      }
      const repetitionRatio = identicalCount / replay.length;
      if (repetitionRatio > 0.95) {
        // Player stayed at the exact same Y height for almost the entire run
        anomalies.push('REPLAY_STATIC_DETECTION');
        anomalyScore += 50;
      }

      // Check boundary limits (e.g. Y < 0 or Y > DISPLAY.HEIGHT)
      let outOfBoundsCount = 0;
      replay.forEach(pt => {
        if (pt.y < 0 || pt.y > 450) { // 450 is DISPLAY.HEIGHT
          outOfBoundsCount++;
        }
      });
      if (outOfBoundsCount > 0) {
        anomalies.push('REPLAY_OUT_OF_BOUNDS');
        anomalyScore += 80;
      }
    }

    return {
      anomalyScore,
      anomalies,
      severe: anomalyScore >= 70
    };
  }
};
