import { useState } from 'react'

type SecretInputProps = {
  value: string
  onChange: (value: string) => void
  className?: string
  placeholder?: string
  autoComplete?: string
  disabled?: boolean
  id?: string
}

function EyeIcon({ open }: { open: boolean }) {
  if (open) {
    // "hide" - crossed eye
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path
          d="M3 3l18 18M10.58 10.58a2 2 0 002.83 2.83M9.88 5.09A9.77 9.77 0 0112 5c5 0 9.27 3.11 11 7.5a11.8 11.8 0 01-4 5.03M6.1 6.1A11.76 11.76 0 001 12.5C2.73 16.89 7 20 12 20a9.8 9.8 0 004.5-1.07"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    )
  }
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M1 12.5C2.73 8.11 7 5 12 5s9.27 3.11 11 7.5C21.27 16.89 17 20 12 20S2.73 16.89 1 12.5z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12.5" r="3" stroke="currentColor" strokeWidth="1.75" />
    </svg>
  )
}

/** Password/secret field with show/hide eye toggle. */
export function SecretInput({
  value,
  onChange,
  className = '',
  placeholder,
  autoComplete = 'off',
  disabled,
  id,
}: SecretInputProps) {
  const [visible, setVisible] = useState(false)
  return (
    <div className="relative">
      <input
        id={id}
        type={visible ? 'text' : 'password'}
        value={value}
        disabled={disabled}
        autoComplete={autoComplete}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className={`${className} pr-10`.trim()}
      />
      <button
        type="button"
        tabIndex={-1}
        disabled={disabled}
        onClick={() => setVisible((v) => !v)}
        className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-fog transition hover:text-snow disabled:opacity-40"
        aria-label={visible ? 'Hide value' : 'Show value'}
        title={visible ? 'Hide' : 'Show'}
      >
        <EyeIcon open={visible} />
      </button>
    </div>
  )
}
