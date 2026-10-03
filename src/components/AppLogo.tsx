import { APP_ICON_PATH, APP_SHORT_NAME } from '../lib/brand'

/** Trim the thin transparent margin around public/app-icon.png (960² squircle in 1024²). */
const LOGO_BLEED_SCALE = 1.07

type AppLogoProps = {
  size?: number
  className?: string
}

export function AppLogo({ size = 44, className = '' }: AppLogoProps) {
  return (
    <span
      className={['relative inline-block shrink-0 overflow-hidden', className].filter(Boolean).join(' ')}
      style={{ width: size, height: size }}
    >
      <img
        src={APP_ICON_PATH}
        alt={APP_SHORT_NAME}
        draggable={false}
        className="absolute inset-0 h-full w-full origin-center object-cover"
        style={{ transform: `scale(${LOGO_BLEED_SCALE})` }}
      />
    </span>
  )
}
