# Roadmap

## Done
- [x] Server core: routing, CORS, HTTP + HTTPS, JSON persistence
- [x] Capture pipeline: HAR import with secret scrubbing, endpoint analysis, replay, handler scaffolding
- [x] Native backend: accounts (scrypt), sessions, K–8 question generator, coins/XP/levels/streaks, shop, avatar, progress, leaderboard
- [x] Admin dashboard: unhandled requests, players, coin grants, recorded endpoints, routes
- [x] Host tunnelling (`/_host/<host>/…`) for browser redirect rules
- [x] Built-in browser game at `/play` (worlds, battles, shop, wardrobe, leaderboard)
- [x] WebSocket frame capture + message-type analysis (Socket.IO aware)
- [x] CI (Node 20 + 22) and Dockerfile

## Next: needs your captures
- [ ] Capture a full session of the current client (docs/CAPTURING.md)
- [ ] Map login/session endpoints onto `/auth/*` logic so new local accounts can sign in
- [ ] Map profile/currency/inventory endpoints onto the player record
- [ ] Map question/battle endpoints onto the question generator and `applyAnswer`
- [ ] Map shop and avatar endpoints
- [ ] Map level/world progress endpoints
- [ ] Serve the realtime channel (WebSocket/Socket.IO) if the analysis shows the client needs one

## Later
- [ ] Teacher/class features (assign skills, view class progress)
- [ ] Multiplayer
- [ ] SQLite storage if the player count grows
