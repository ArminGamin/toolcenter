import type { ReactNode } from 'react'
import type { IconKey } from '../types'

const shapes: Record<IconKey, ReactNode> = {
  // used-car listing tracker
  car: (
    <>
      <path d="M4.5 14.5h15" />
      <path d="M6 14.5 7.6 9.8c.2-.6.8-1 1.4-1h6c.6 0 1.2.4 1.4 1l1.6 4.7" />
      <circle cx="8" cy="16.5" r="1.4" />
      <circle cx="16" cy="16.5" r="1.4" />
      <path d="M9.5 9h5" />
    </>
  ),
  // web scrape / harvest
  scraper: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M16 16.5 20.5 21" />
      <path d="M8 9.5h6M8 12.5h4" />
    </>
  ),
  // discord / chat channels
  discord: (
    <>
      <path d="M7.5 17.5c1.2.7 2.7 1.1 4.5 1.1s3.3-.4 4.5-1.1" />
      <path d="M8.2 7.2C9.5 6.4 10.9 6 12 6s2.5.4 3.8 1.2" />
      <path d="M8.5 10.8v.2M15.5 10.8v.2" />
      <path d="M6.8 14.2c-.6-1.6-.8-3.2-.6-4.6.9-1.1 2.3-1.9 3.8-2.3l.6 1.2c.5-.1 1-.2 1.4-.2s.9.1 1.4.2l.6-1.2c1.5.4 2.9 1.2 3.8 2.3.2 1.4 0 3-.6 4.6-.9 1-2.2 1.7-3.6 2.1L14 15.2c-.6.2-1.3.3-2 .3s-1.4-.1-2-.3l-.6 1.1c-1.4-.4-2.7-1.1-3.6-2.1Z" />
    </>
  ),
  // newsletter / envelope
  mail: (
    <>
      <rect x="3.5" y="6" width="17" height="12" rx="2" />
      <path d="m4.5 8 7.5 5.5L19.5 8" />
    </>
  ),
  // post carousel / stacked slides
  carousel: (
    <>
      <rect x="7" y="5.5" width="10" height="13" rx="1.5" />
      <path d="M5 8v8M19 8v8" />
      <path d="M10 10.5h4M10 13.5h3" />
    </>
  ),
  // lead finder / radar + person
  leads: (
    <>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="3.5" />
      <path d="M12 4v2.5M12 17.5V20M4 12h2.5M17.5 12H20" />
    </>
  ),
  // gmail-style M
  gmail: (
    <>
      <path d="M4.5 7.5v9a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-9" />
      <path d="m4.5 8.5 7.5 5.5 7.5-5.5" />
      <path d="M12 14V7.5" />
    </>
  ),
  // motion blur streaks
  blur: (
    <>
      <path d="M4 8h11" />
      <path d="M4 12h16" />
      <path d="M4 16h9" />
      <path d="M17 7.5 20.5 12 17 16.5" />
    </>
  ),
  // video / film
  video: (
    <>
      <rect x="3.5" y="6.5" width="12" height="11" rx="2" />
      <path d="m15.5 10 5-2.5v9L15.5 14" />
    </>
  ),
  book: (
    <>
      <path d="M5 5.5h6.5a2 2 0 0 1 2 2V19a1.5 1.5 0 0 0-1.5-1.5H5Z" />
      <path d="M19 5.5h-6.5a2 2 0 0 0-2 2V19a1.5 1.5 0 0 1 1.5-1.5H19Z" />
    </>
  ),
  factory: (
    <>
      <path d="M4 19V10l4 3V10l4 3V8l8 4v7Z" />
      <path d="M8 19v-3M12 19v-3M16 19v-3" />
    </>
  ),
  health: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 8v8M8 12h8" />
    </>
  ),
  ollama: (
    <>
      <circle cx="12" cy="12" r="7.5" />
      <circle cx="9.2" cy="11" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="14.8" cy="11" r="1.1" fill="currentColor" stroke="none" />
      <path d="M9.5 14.5c.8.8 1.7 1.2 2.5 1.2s1.7-.4 2.5-1.2" />
    </>
  ),
  database: (
    <>
      <ellipse cx="12" cy="6.5" rx="7" ry="2.5" />
      <path d="M5 6.5v11c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5v-11" />
      <path d="M5 12c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5" />
    </>
  ),
  markets: (
    <>
      <path d="M4 16.5 9 11l3.5 3.5L20 7" />
      <path d="M15 7h5v5" />
    </>
  ),
  notes: (
    <>
      <path d="M6.5 3.8h8.2l3.8 3.8v12.6H6.5a2 2 0 0 1-2-2v-12.4a2 2 0 0 1 2-2Z" />
      <path d="M14.5 3.8v4h4" />
      <path d="M8 11h7.5M8 14.5h7.5M8 18h4.5" />
    </>
  ),
  outreach: (
    <>
      <path d="M4 7h16" />
      <path d="M4 12h10" />
      <path d="M4 17h7" />
      <path d="M16 14.5 20 12l-4-2.5v5Z" />
    </>
  ),
  pipeline: (
    <>
      <path d="M5 6.5h5v5H5z" />
      <path d="M14 6.5h5v5h-5z" />
      <path d="M5 15.5h5v5H5z" />
      <path d="M14 15.5h5v5h-5z" />
      <path d="M10 9v6M14 12H10" />
    </>
  ),
  seoBlog: (
    <>
      <path d="M7 4.5h8.5a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-11a2 2 0 0 1 2-2Z" />
      <path d="M8.5 9h7M8.5 12.5h7M8.5 16h4.5" />
      <path d="M15.5 18.5 18 16l1.5 1.5" />
    </>
  ),
  groupPoster: (
    <>
      <path d="M8 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
      <path d="M16 11a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z" />
      <path d="M3.5 19.5c.6-2.8 2.6-4.5 4.5-4.5s3.9 1.7 4.5 4.5" />
      <path d="M13 15.2c1.1-.5 2.3-.7 3-.7 1.7 0 3.4 1.2 4 3.5" />
      <path d="M14.5 19.5h5.2" />
    </>
  ),
  redditCommenter: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="9" cy="11" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="15" cy="11" r="1.1" fill="currentColor" stroke="none" />
      <path d="M8.5 15.5c1.2 1.3 2.6 2 3.5 2s2.3-.7 3.5-2" />
    </>
  ),
  ugcSlides: (
    <>
      <rect x="4.5" y="7" width="8" height="11" rx="1.5" />
      <rect x="8" y="5" width="8" height="11" rx="1.5" />
      <rect x="11.5" y="3" width="8" height="11" rx="1.5" />
      <path d="M13.5 7.5l3.5 2.2v-4.4Z" />
      <path d="M14 14.5h3.5M14 16.5h2.5" />
    </>
  ),
  oneShot: (
    <>
      <rect x="6" y="3.5" width="12" height="17" rx="2" />
      <path d="M8.5 8h7M8.5 11.5h7M8.5 15h4.5" />
    </>
  ),
}

export function ToolIcon({
  id,
  size = 20,
  className,
}: {
  id: IconKey
  size?: number
  className?: string
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      {shapes[id]}
    </svg>
  )
}
