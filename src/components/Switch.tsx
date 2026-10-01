interface SwitchProps {
  checked: boolean
  onChange: (next: boolean) => void
  disabled?: boolean
  'aria-label'?: string
}

export function Switch({
  checked,
  onChange,
  disabled = false,
  'aria-label': ariaLabel,
}: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={[
        'relative h-[22px] w-[38px] shrink-0 rounded-full border transition-colors duration-150',
        checked ? 'border-phosphor/50 bg-phosphor/20' : 'border-lineStrong bg-lift',
        disabled ? 'cursor-not-allowed opacity-40' : 'cursor-pointer',
      ].join(' ')}
    >
      <span
        className={[
          'absolute top-[2px] left-[2px] h-4 w-4 rounded-full transition-transform duration-150',
          checked ? 'translate-x-4 bg-phosphor' : 'translate-x-0 bg-fog',
        ].join(' ')}
      />
    </button>
  )
}
