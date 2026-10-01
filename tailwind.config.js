/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      borderColor: {
        DEFAULT: 'var(--border-subtle)',
      },
      colors: {
        /* Elevation scale — values live in :root CSS vars (index.css) */
        ink: 'rgb(var(--surface-page) / <alpha-value>)',
        panel: 'rgb(var(--surface-panel) / <alpha-value>)',
        raised: 'rgb(var(--surface-card) / <alpha-value>)',
        lift: 'rgb(var(--surface-lift) / <alpha-value>)',
        well: 'rgb(var(--surface-input) / <alpha-value>)',
        line: 'var(--border-subtle)',
        lineStrong: 'var(--border-strong)',
        brass: 'rgb(var(--accent-brass) / <alpha-value>)',
        brassSoft: 'rgb(var(--accent-brass) / 0.12)',
        phosphor: 'rgb(var(--accent-success) / <alpha-value>)',
        phosphorSoft: 'rgb(var(--accent-success) / 0.12)',
        ember: 'rgb(var(--accent-danger) / <alpha-value>)',
        mist: 'rgb(var(--text-secondary) / <alpha-value>)',
        fog: 'rgb(var(--text-muted) / <alpha-value>)',
        snow: 'rgb(var(--text-primary) / <alpha-value>)',
        onAccent: 'rgb(var(--on-accent) / <alpha-value>)',
        onTool: '#18342c',
        red: { 300: 'rgb(var(--accent-danger) / <alpha-value>)' },
        rose: { 300: 'rgb(var(--accent-danger) / <alpha-value>)', 500: 'rgb(var(--accent-danger) / <alpha-value>)' },
        violet: { 300: 'rgb(var(--accent-violet) / <alpha-value>)' },
      },
      fontFamily: {
        sans: ['"Atkinson Hyperlegible Next"', '"Segoe UI"', 'system-ui', 'sans-serif'],
        mono: ['"Atkinson Hyperlegible Mono"', 'ui-monospace', 'monospace'],
      },
      fontSize: {
        /* 15px reading size at Standard; everything scales with --reading-scale */
        xs: ['calc(0.8125rem * var(--reading-scale))', { lineHeight: '1.5' }],
        sm: ['calc(0.9375rem * var(--reading-scale))', { lineHeight: '1.55' }],
        base: ['calc(0.9375rem * var(--reading-scale))', { lineHeight: '1.6' }],
        lg: ['calc(1.0625rem * var(--reading-scale))', { lineHeight: '1.45' }],
        xl: ['calc(1.25rem * var(--reading-scale))', { lineHeight: '1.35' }],
        '2xl': ['calc(1.5rem * var(--reading-scale))', { lineHeight: '1.25' }],
      },
      spacing: {
        3: '0.875rem',
        4: '1.125rem',
        5: '1.375rem',
      },
      lineHeight: {
        relaxed: '1.6',
      },
      boxShadow: {
        glow: '0 0 0 2px rgb(var(--accent-brass) / 0.3)',
        glowEmber:
          '0 0 0 1px rgba(224,106,85,0.45), 0 0 18px rgba(224,106,85,0.38), 0 0 36px rgba(224,106,85,0.16)',
        panel: '0 2px 12px rgb(var(--shadow-color) / 0.1)',
        card: '0 1px 4px rgb(var(--shadow-color) / 0.08)',
      },
      keyframes: {
        pulseRing: {
          '0%': { transform: 'scale(1)', opacity: '0.5' },
          '100%': { transform: 'scale(1.85)', opacity: '0' },
        },
        drift: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-4px)' },
        },
        hubGlow: {
          '0%, 100%': { opacity: '0.5' },
          '50%': { opacity: '1' },
        },
        orbitLineBreath: {
          '0%, 100%': { opacity: '0.15' },
          '50%': { opacity: '0.72' },
        },
        orbitRingBreath: {
          '0%, 100%': { opacity: '0.22' },
          '50%': { opacity: '0.5' },
        },
        emberGlow: {
          '0%, 100%': {
            boxShadow:
              '0 0 0 1px rgba(224,106,85,0.4), 0 0 14px rgba(224,106,85,0.32), 0 0 28px rgba(224,106,85,0.12)',
          },
          '50%': {
            boxShadow:
              '0 0 0 1px rgba(224,106,85,0.65), 0 0 24px rgba(224,106,85,0.5), 0 0 48px rgba(224,106,85,0.22)',
          },
        },
      },
      animation: {
        pulseRing: 'pulseRing 2.8s ease-out infinite',
        drift: 'drift 6s ease-in-out infinite',
        hubGlow: 'hubGlow 3.6s ease-in-out infinite',
        orbitLineBreath: 'orbitLineBreath 3.2s ease-in-out infinite',
        orbitRingBreath: 'orbitRingBreath 4.2s ease-in-out infinite',
        emberGlow: 'emberGlow 2.2s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}
