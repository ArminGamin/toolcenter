import { useEffect, useRef, useState } from 'react'
import { APPEARANCE_KEY, readAppearance, saveAppearance, type Appearance } from '../lib/appearance'
import { FINISH_SOUNDS, playFinishSound, readFinishSound, saveFinishSound, type FinishSound } from '../lib/finish-sound'

export function AppearanceControls() {
  const menuRef = useRef<HTMLDetailsElement>(null)
  const [settings, setSettings] = useState(readAppearance)
  const [stored, setStored] = useState(true)
  const [sound, setSound] = useState(readFinishSound)

  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) menuRef.current?.removeAttribute('open')
    }
    const sync = (event: StorageEvent) => {
      if (event.key === APPEARANCE_KEY || event.key === null) setSettings(readAppearance())
    }
    document.addEventListener('click', close)
    window.addEventListener('storage', sync)
    return () => {
      document.removeEventListener('click', close)
      window.removeEventListener('storage', sync)
    }
  }, [])

  function update(next: Partial<Appearance>) {
    const value = { ...settings, ...next }
    setStored(saveAppearance(value))
    setSettings(value)
  }

  function chooseSound(next: FinishSound) {
    setSound(next)
    saveFinishSound(next)
    playFinishSound(next)
  }

  return (
    <details ref={menuRef} className="appearance-menu relative" onKeyDown={event => {
      if (event.key === 'Escape' && menuRef.current?.open) {
        event.preventDefault()
        event.stopPropagation()
        menuRef.current.removeAttribute('open')
        menuRef.current.querySelector('summary')?.focus()
      }
    }}>
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-lg border border-lineStrong bg-raised px-3 py-2 font-semibold text-mist hover:bg-lift hover:text-snow" aria-label="Appearance and readability">
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M4 19 10 5l6 14M6 14h8M17 10h5M19.5 10v9" strokeLinecap="round" strokeLinejoin="round" /></svg>
        <span className="max-[600px]:hidden">Appearance</span>
      </summary>
      <div className="appearance-popover absolute right-0 top-[calc(100%+10px)] z-[120] w-[360px] max-w-[calc(100vw-32px)] space-y-5 whitespace-normal rounded-2xl border border-lineStrong bg-panel p-5 shadow-panel" role="dialog" aria-label="Appearance and readability settings">
        <div>
          <h2 className="text-xl font-bold text-snow">Make it comfortable</h2>
          <p className="mt-1 text-xs text-fog">Adjust the screen to suit your eyes.</p>
        </div>
        <fieldset>
          <legend className="mb-3 text-sm font-semibold text-snow">Colours</legend>
          <div className="grid grid-cols-2 gap-3">
            {([['paper', 'Light', 'Clean and bright'], ['slate', 'Dark', 'Easy on the eyes at night']] as const).map(([theme, name, description]) => (
              <button key={theme} type="button" aria-pressed={settings.theme === theme} onClick={() => update({ theme })} className={`rounded-xl border p-3 text-left ${settings.theme === theme ? 'border-brass bg-brass/10' : 'border-lineStrong hover:bg-lift'}`}>
                <span className={`mb-2 block h-5 rounded border border-lineStrong ${theme === 'paper' ? 'bg-[#fcfcfd]' : 'bg-[#161a22]'}`} aria-hidden="true" />
                <span className="block font-bold text-snow">{name}</span>
                <span className="block text-xs text-mist">{description}</span>
              </button>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend className="mb-3 text-sm font-semibold text-snow">Text size</legend>
          <div className="grid grid-cols-2 gap-3">
            {([['comfortable', 'Standard', '15px body text'], ['large', 'Large', '17px body text']] as const).map(([textSize, name, description]) => (
              <button key={textSize} type="button" aria-pressed={settings.textSize === textSize} onClick={() => update({ textSize })} className={`min-h-11 rounded-xl border p-3 text-left ${settings.textSize === textSize ? 'border-brass bg-brass/10' : 'border-lineStrong hover:bg-lift'}`}>
                <span className="block font-bold text-snow">{name}</span>
                <span className="block text-xs text-mist">{description}</span>
              </button>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend className="mb-1 text-sm font-semibold text-snow">Sound when a task finishes</legend>
          <p className="mb-3 text-xs text-fog">Click one to hear it.</p>
          <div className="grid grid-cols-2 gap-2">
            {FINISH_SOUNDS.map(({ id, name, description }) => (
              <button key={id} type="button" aria-pressed={sound === id} onClick={() => chooseSound(id)} title={description} className={`min-h-11 rounded-xl border px-2 py-2 text-left ${sound === id ? 'border-brass bg-brass/10' : 'border-lineStrong hover:bg-lift'}`}>
                <span className="block font-bold text-snow">{name}</span>
                <span className="block truncate text-xs text-mist">{description}</span>
              </button>
            ))}
          </div>
        </fieldset>
        <p className="border-t border-line pt-4 text-xs text-fog">Stronger lettering is used throughout. {stored ? 'Your choices are saved in this browser.' : 'Applied for this session.'}</p>
      </div>
    </details>
  )
}
