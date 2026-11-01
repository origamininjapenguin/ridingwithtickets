# Ticket to Ride Online

A real-time multiplayer take on the USA map: Node.js + Socket.IO on the server, a three.js 3D board in the browser.
Play with 2 to 5 people, or add bots. This is a fan project and is not affiliated with Days of Wonder. Please keep it non-commercial.

## Deploy on Render

Render deploys from a Git repo (it can't take a zip upload directly), so:

1. Unzip, then push the folder to a new GitHub or GitLab repo.
2. In Render choose **New > Web Service** and connect that repo (or **New > Blueprint** to use `render.yaml`).
3. Settings if you enter them by hand: Runtime **Node**, Build Command `npm install`, Start Command `npm start`, Health Check Path `/healthz`.
4. Deploy, then open the `.onrender.com` URL and share the 4-letter table code or invite link.

Notes
- Game state lives in memory. Run a **single instance** (don't scale to 2+), and a restart or free-tier sleep ends games in progress.
- The server reads `PORT` from the environment, as Render requires.
- three.js is served from `node_modules` after `npm install`, so no CDN is needed for it. Only the Google Fonts stylesheet is remote, with system fallbacks.

## Run locally

    npm install
    npm start        # http://localhost:3000
    npm test         # bots play full 2-5 player games and check the rules engine

## What's in it

- Full USA rules: 36 cities, 78 routes (100 lanes), 30 destination tickets, 110 train cards, 45 trains each.
- Face-up market with the three-locomotive reset, locomotive-as-wild, double routes (second lane closed for 2-3 players), route scoring, last-round trigger at 2 trains, ticket scoring, and the 10-point longest-route bonus.
- 3D board: parchment map, train cars that drop onto claimed routes, a steaming toy locomotive that rolls along each new claim, glowing routes you can afford, hover a ticket to light up its two cities.
- Table codes and invite links, color choice, bots, table chat, emotes, synthesized sound effects (no audio files).
- Reconnect: refresh or lose signal and you drop back into your seat. After 45 seconds away a bot plays your turns until you return.

## Files

    server.js        rooms, sockets, bot/auto-play tick
    game.js          authoritative rules engine
    bot.js           bot player logic
    shared/mapdata.js  cities, routes, tickets, shared rule helpers (server + browser)
    public/          index.html, css, js (main.js UI, board.js three.js, sfx.js)
    test/sim.js      rules simulation
