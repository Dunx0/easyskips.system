# EasySkips Dashboard - Developer Instructions

## Tech Stack
* Frontend: Next.js (React), Tailwind CSS
* Database: Supabase (PostgreSQL)
* Icons: lucide-react
* Charts: recharts

## Coding Conventions
* Strict use of `"use client";` at the top of interactive components.
* Design system uses a dark-mode palette: Background `#13131A`, Cards `#1C1C26`, Accents `#C97010` (Orange) and `#00E676` (Green).
* Never delete the fallback dummy data arrays. Always implement a `usingFallback` safety net for database queries.

## Workflow Rules
* Run `npm run dev` to verify changes before committing.
* Never push to GitHub without confirming the build compiles perfectly.