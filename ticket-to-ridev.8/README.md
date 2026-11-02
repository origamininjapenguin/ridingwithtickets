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
- three.js and Tone.js are served from `node_modules` after `npm install`, so no CDN is needed for them (Tone.js falls back to jsDelivr if its local file is ever missing). Only the Google Fonts stylesheet is remote, with system fallbacks.

## Run locally

    npm install
    npm start        # http://localhost:3000
    npm test         # bots play full 2-5 player games and check the rules engine

## What's in it

- Full USA rules: 36 cities, 78 routes (100 lanes), 30 destination tickets, 110 train cards, 45 trains each.
- Face-up market with the three-locomotive reset, locomotive-as-wild, double routes (second lane closed for 2-3 players), route scoring, last-round trigger at 2 trains, ticket scoring, and the 10-point longest-route bonus.
- 3D board: parchment map, train cars that drop onto claimed routes, a steaming toy locomotive that rolls along each new claim, glowing routes you can afford, hover a ticket to light up its two cities.
- Public tables: the host can set a table to Public in the setup menu, and open public tables are listed on the start screen with a Join button (private tables are only reachable by code or invite link).
- Turn timer: Off, 30, 60, 90 seconds, 2 or 3 minutes, set in the setup menu. The countdown shows above the player list. When it runs out, the bot logic makes a move for that player; choosing starting tickets gets double time.
- Table codes and invite links, color choice (pick a bot's color and it swaps with yours), bots, table chat, emotes.
- Tone.js background music (a banjo-and-bass railroad loop that adds a steam-train chug in game) plus synthesized sound effects, each with its own volume slider in the Menu.
- Menu button: table code and invite link, music and effects volume, rules, and leave table / back to the start menu.
- Leave a table mid-game and a bot takes over your seat, hand and tickets. Come back any time with the Resume button on the start screen (or the same table code) and the bot stops: you get your seat back. If you just lose signal or close the tab, you can refresh back into your seat, and after 45 seconds away a bot plays your turns until you return.
- The board fills the whole screen with slim panels floating over it: players and tickets on the left; menu, card market, log and chat on the right; your cards and tickets along the bottom. Sizes scale with the window height, so any 16:9 display gets the same layout. Narrow phone screens stack instead, with log and chat behind a Chat button.
- Destination tickets open in a side panel (with colored map markers for each ticket) instead of covering the board; Hide it to see everything.

## Files

    server.js        rooms, sockets, bot/auto-play tick
    game.js          authoritative rules engine
    bot.js           bot player logic
    shared/mapdata.js  cities, routes, tickets, shared rule helpers (server + browser)
    public/          index.html, css, js (main.js UI, board.js three.js, music.js Tone.js, sfx.js)
    test/sim.js      rules simulation

Testing note: set `TTR_TIMER_SCALE=0.05` to shrink the turn timer 20x when testing timeouts locally.
