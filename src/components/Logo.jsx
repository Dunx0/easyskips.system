/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  src/components/Logo.jsx — shared in ALL THREE apps
 *
 *  Icon-only versions of the three marks as React components. Pick one,
 *  import it everywhere the Container icon currently sits, delete the rest
 *  (or keep all three until the client decides).
 *
 *  Usage:   <LogoTipper size={40} />
 *  All scale crisply at any size — they're vectors.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const AmberDefs = ({ id }) => (
  <defs>
    <linearGradient id={id} x1="0" y1="0" x2="0.6" y2="1">
      <stop offset="0%" stopColor="#FBBF24" />
      <stop offset="100%" stopColor="#EA580C" />
    </linearGradient>
  </defs>
);

/* ── 1 · THE TIPPER — solid skip with lift chevron ───────────────────────── */
export function LogoTipper({ size = 40 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 102 116" aria-label="SkipCommand">
      <AmberDefs id="lg-tipper" />
      <path
        d="M4 22 L34 22 L51 44 L68 22 L98 22 L84 96 Q83 102 77 102 L25 102 Q19 102 18 96 Z"
        fill="url(#lg-tipper)"
      />
      <path d="M0 14 L34 14 L38 22 L4 22 Z" fill="url(#lg-tipper)" opacity="0.85" />
      <path d="M68 22 L64 14 L102 14 L98 22 Z" fill="url(#lg-tipper)" opacity="0.85" />
      <path
        d="M40 62 L51 48 L62 62"
        fill="none" stroke="#0F0F13" strokeWidth="7"
        strokeLinecap="round" strokeLinejoin="round"
      />
    </svg>
  );
}

/* ── 2 · THE PROMPT — outlined skip + terminal chevron ───────────────────── */
export function LogoPrompt({ size = 40 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 104" aria-label="SkipCommand">
      <defs>
        <linearGradient id="lg-pa" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#FBBF24" />
          <stop offset="100%" stopColor="#F97316" />
        </linearGradient>
        <linearGradient id="lg-pc" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#67E8F9" />
          <stop offset="100%" stopColor="#0891B2" />
        </linearGradient>
      </defs>
      <path
        d="M2 18 L26 18 M74 18 L98 18 M8 18 L20 90 Q21 96 27 96 L73 96 Q79 96 80 90 L92 18"
        fill="none" stroke="url(#lg-pa)" strokeWidth="9"
        strokeLinecap="round" strokeLinejoin="round"
      />
      <path
        d="M38 30 L58 50 L38 70"
        fill="none" stroke="url(#lg-pc)" strokeWidth="10"
        strokeLinecap="round" strokeLinejoin="round"
      />
      <line x1="64" y1="68" x2="78" y2="68" stroke="url(#lg-pc)" strokeWidth="10" strokeLinecap="round" />
    </svg>
  );
}

/* ── 3 · THE BADGE — hex livery badge with hazard chevrons ───────────────── */
export function LogoBadge({ size = 40 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 124 124" aria-label="SkipCommand">
      <defs>
        <linearGradient id="lg-b" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#FBBF24" />
          <stop offset="100%" stopColor="#D97706" />
        </linearGradient>
        <clipPath id="lg-bclip">
          <path d="M62 6 L112 34 L112 90 L62 118 L12 90 L12 34 Z" />
        </clipPath>
      </defs>
      <path
        d="M62 6 L112 34 L112 90 L62 118 L12 90 L12 34 Z"
        fill="#16161C" stroke="url(#lg-b)" strokeWidth="7" strokeLinejoin="round"
      />
      <g clipPath="url(#lg-bclip)" opacity="0.95">
        <g transform="translate(0,76)">
          <path d="M-8 0 L8 0 L28 22 L12 22 Z" fill="url(#lg-b)" />
          <path d="M24 0 L40 0 L60 22 L44 22 Z" fill="url(#lg-b)" />
          <path d="M56 0 L72 0 L92 22 L76 22 Z" fill="url(#lg-b)" />
          <path d="M88 0 L104 0 L124 22 L108 22 Z" fill="url(#lg-b)" />
        </g>
      </g>
      <path d="M34 36 L90 36 L82 66 Q81 70 77 70 L47 70 Q43 70 42 66 Z" fill="url(#lg-b)" />
      <rect x="30" y="30" width="64" height="6" rx="3" fill="url(#lg-b)" />
    </svg>
  );
}