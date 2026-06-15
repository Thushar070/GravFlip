<div align="center">

# 🚀 GRAVFLIP RUNNER

**Flip gravity. Dodge obstacles. Survive.**

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/Thushar070/GravFlip)
[![License: Proprietary](https://img.shields.io/badge/License-Proprietary-blue.svg)](#)
[![Built With](https://img.shields.io/badge/Built_With-Vanilla_JS_+_Node.js-f7df1e.svg)](#)

</div>

---

## 📖 About

GravFlip Runner is a fast-paced, neon-infused anti-gravity platformer where survival depends on your ability to manipulate gravity. Instead of jumping, you flip gravity to traverse floors and ceilings, dodging hazardous obstacles, collecting stars, and testing your reflexes in an ever-accelerating deep space environment.

This is an original web game built from scratch without any heavy frameworks. It utilizes the HTML5 Canvas API for high-performance rendering and the Web Audio API for dynamic procedural sound generation. 

It is designed to be a fully production-ready, highly polished browser game with an architecture that supports offline play as well as competitive global leaderboards.

---

## 🎮 Game Modes

| Mode | Description |
| :--- | :--- |
| **CLASSIC** | The original survival challenge. Survive as long as you can, score points, and aim for a global high score. |
| **MIRROR** | Control two astronauts simultaneously on a split screen. If either player crashes, it is game over for both! |
| **BLITZ** | An intense mode where the speed increases rapidly and never slows down. Designed for veteran players. |
| **CAMPAIGN** | A 5-world story mode containing unique hazards, visual themes, and progression tracking. |

---

## ✨ Features

- 🌌 **5 Campaign Worlds** — Handcrafted challenges including Neon City, Asteroid Belt, Solar Flare, and The Singularity.
- 🎨 **Dynamic Visual Themes** — Transitions smoothly between Deep Space, Neon Grid, Crimson Void, and Aurora.
- ☠️ **Obstacle Types** — Avoid Laser Gates, Crushers, Phantom Blocks, and rotating Saw Blades.
- 🎵 **Web Audio API** — Fully procedural 8-bit / synthwave sound design, no external audio files required.
- 🏆 **Global Leaderboard** — Compete for the #1 spot powered by Vercel KV Redis.
- 🛡️ **Anti-Cheat Engine** — 5-layer server-side validation to ensure all submitted scores are physically possible.
- 📱 **Mobile Optimized** — Scales perfectly with touch controls, blocked zooming, and iOS bounce scroll prevention.

---

## 🕹️ How to Play

1. **Flip Gravity:** Press the `Spacebar` or `Tap` the screen to flip your gravity between the floor and ceiling.
2. **Dodge:** Avoid all incoming obstacles. Grazing an obstacle triggers a split-second "Coyote Time" window to escape.
3. **Collect:** Gather stars for bonus points. Collecting stars consecutively builds your combo multiplier.
4. **Survive:** Last as long as you can! The game speed gradually increases as you clear zones.

---

## 🚀 Deploy Your Own

You can deploy your own instance of GravFlip Runner in minutes using Vercel.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/Thushar070/GravFlip)

### Manual Setup
1. **Clone the repository:**
   ```bash
   git clone https://github.com/Thushar070/GravFlip.git
   cd GravFlip
   ```
2. **Set up the Database:**
   - Create a Vercel KV (Redis) database in your Vercel dashboard.
   - Copy `.env.example` to `.env` and fill in your credentials.
3. **Run locally:**
   ```bash
   npm install
   npm run dev
   ```
4. **Deploy:**
   ```bash
   npx vercel deploy --prod
   ```

---

## 🏗️ Architecture

```text
       Browser (Client)
             │
             ▼ (HTTPS POST /api/scores)
    ┌─────────────────┐
    │ Vercel Edge API │  ◄── Rate Limiting (lib/rateLimit.js)
    └────────┬────────┘
             │           ◄── Score Validation Engine (lib/scoreValidator.js)
             ▼
    ┌─────────────────┐
    │ Vercel KV Redis │  ◄── Leaderboard & Sessions (lib/db.js)
    └─────────────────┘
```

---

## 🛡️ Anti-Cheat Engine

GravFlip Runner employs a robust backend validation engine to keep the leaderboards clean:
1. **Token Integrity:** Uses SHA-256 HMAC-style signing to prevent payload tampering.
2. **Physics Plausibility:** Verifies the score mathematically matches the survival time and combo rate.
3. **Frame Rate Check:** Ensures the frame count correlates closely with the real-world timestamp.
4. **Speed Validation:** Confirms the final game speed matches the theoretical acceleration curve.
5. **Session Banning:** Flags and permanently bans anonymous sessions that submit impossible data.

---

## 📁 Project Structure

```text
gravflip-runner/
├── public/                 # Static frontend assets served to the browser
│   ├── index.html          # Main HTML layout and UI overlays
│   ├── style.css           # Modern neon styling and animations
│   └── game.js             # Core 60fps canvas game engine and API client
├── api/                    # Vercel Serverless Functions
│   ├── auth.js             # Anonymous session creation
│   ├── scores.js           # Read/Write for global leaderboards
│   └── verify.js           # Debug endpoint for token validation
├── lib/                    # Shared backend utilities
│   ├── db.js               # Vercel KV Redis database wrapper
│   ├── rateLimit.js        # IP-based API rate limiting
│   └── scoreValidator.js   # Physics-based anti-cheat engine
├── vercel.json             # Vercel routing and security headers
└── package.json            # Scripts and dependencies
```

---

## 👨‍💻 Credits

Created by **Thushar TL**
Computer Science, SSN College of Engineering, Chennai.

[GitHub Profile](https://github.com/Thushar070)
