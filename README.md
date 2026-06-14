# EasySkips — Owner Portal

Real-time operations dashboard for Easy Skips Rustenburg.

## Quick Start

1. Open this folder in VS Code (File → Open Folder → select "easyskips")
2. Open Terminal: press Ctrl + `
3. Run:

```
npm install
npm run dev
```

4. Open Chrome → http://localhost:3000

## What's Built

- **Summary** — Revenue vs Cost bar chart, KPI sidebar, payment mix, skip size donut, daily debrief, invoice table
- **Drivers** — Leaderboard, bonus calculator, detail table
- **All 10 tabs** — KPIs working, full charts in next session
- **4 colour themes** — click the circles in the top-right
- **Period filters** — Daily / Weekly / Monthly / Yearly / All Time per tab

## Project Structure

```
src/
├── app/dashboard/          ← All dashboard pages
│   ├── page.js             ← Summary (landing)
│   ├── drivers/page.js     ← Driver Performance
│   └── [other tabs]/       ← Structured stubs
├── components/             ← KPICard, FilterBar, ThemeSwitcher, Clock
└── lib/
    ├── data.js             ← Mock data (→ Supabase later)
    └── helpers.js          ← Formatting + data processing
```

## Next Session

- Full charts on all tabs
- Supabase database connection
- User authentication
- Deploy to Vercel
