# Meta Ads Manager demo (MERN, single page)

React (Vite) + Express + MongoDB + Cloudinary. One page (two entrances: the main site at `/` and the admin panel at `/admin`).

## Run locally
    npm install
    npm run build
    npm start            # http://localhost:5000  (API + built UI)
    # (Windows PowerShell 5 has no `&&` - run the lines one at a time, or join them with `;`)
    # or, for hot reload:  npm run dev   (UI on :5173, API on :5000)

Copy `.env.example` to `.env` and fill in:
- `MONGO_URI` - Atlas / VPS Mongo. Empty = temporary in-memory DB (resets on restart).
- `CLOUDINARY_*` - ad media uploads. Empty = files saved in `server/uploads`.
- Demo data is auto-created when the database is empty (`SEED_ON_EMPTY=false` to disable; `npm run seed` resets it).

## Deploy on a VPS
    git clone / upload, then: npm install && npm run build
    npm i -g pm2 && pm2 start server/index.js --name meta-ads && pm2 save
    # nginx: proxy_pass http://127.0.0.1:5000;  client_max_body_size 100m;

## How the numbers work (server/formulas.js)
Only spend, impressions, reach and link clicks are stored per ad per day. Everything else is derived:
CPM = spend / impressions x 1000 · CTR = clicks / impressions · CPC = spend / clicks · Frequency = impressions / reach.
Ad set / campaign rows and the Total row are sums of the daily rows in the selected date range, so changing dates,
filters or editing a day recalculates everything. Every create/edit/toggle/data change is logged (Activity history).

## Deployed (Coolify)
Live: https://meta-ads.187.126.115.90.sslip.io  (Coolify project "Meta Ads Demo" > service "meta-ads-demo", Docker Compose).
The service builds from the code copied to `/opt/meta-ads` on the VPS (`docker-compose.coolify.yml`); Atlas/Cloudinary settings
live in the service's Coolify environment variables (not in the image). To ship an update: re-copy the project to
`/opt/meta-ads` (without `.env`/`node_modules`) and press Redeploy on the service in Coolify.

## Two entrances: main site and admin panel
- `/` is the main website: view-only for editing features. Duplicate, Edit, A/B test and the three buttons right of
  Breakdown (Reports, Export, Charts) are disabled, with every other way into those features (row chips, row menu, right rail).
- `/admin` is the same Ads Manager with in-place editing: log in with the admin account, then double-click an amount,
  name, status, budget or image to change it (Enter saves, Esc cancels). Typing a new total rescales the stored daily rows
  (`PUT /api/admin/metric`, server/routes.js) so the total is exact and CPM / CTR / CPC / frequency follow the formulas.
- Both read the same database, so an admin change shows up on the main site by itself: same-browser tabs hear it at once,
  other devices within a few seconds (the app polls `GET /api/version`). Every edit is logged in Activity history as "Admin".
- Test against an isolated database: a local `.env` with `MONGO_URI` set writes to that database, so run
  `MONGO_URI= CLOUDINARY_URL= CLOUDINARY_CLOUD_NAME= CLOUDINARY_API_KEY= CLOUDINARY_API_SECRET= PORT=5055 node server/index.js`
  to get a throw-away in-memory copy.

## Admin login
The whole app sits behind login (the admin account, plus an optional shareable demo account via `DEMO_EMAIL` / `DEMO_PASSWORD`;
only the admin account is accepted at `/admin`). Set `ADMIN_EMAIL`, `ADMIN_PASSWORD` and `SESSION_SECRET` in `.env`
(locally) or in the Coolify service's environment (production). The password is hashed in memory and the session is a
signed, HttpOnly, 7-day cookie. Change the password by editing the variable and redeploying.
