import { useEffect, useState } from 'react'
import type { ChainSettings, OutreachSettings, OutreachState } from '../../lib/outreach'
import { inputCls } from '../ui/primitives'
import {
  deleteOutreachSendProfile,
  loadOutreachSendProfile,
  saveOutreachSendProfile,
} from '../../lib/outreach'
import { SecretInput } from '../SecretInput'
import { EmptyState } from '../ui/primitives'
import { Btn, Check, Field, Section } from './outreach-ui'

export function SendSection({
  settings,
  vault,
  assets,
  profiles,
  profileStore,
  chain,
  pending,
  onChange,
  onChangeChain,
  onProfilesChange,
  onBeforeProfileAction,
  onFlash,
  onSend,
  onTest,
  onLoadPromo,
  onResetSent,
  onResetRejected,
  onClearRun,
  onClearActiveDb,
  onClearAllDbs,
  busy,
  canSend,
}: {
  settings: OutreachSettings
  vault: OutreachState['vault']
  assets?: OutreachState['assets']
  profiles: { name: string; updatedAt: string; from: string; keyMasked: string }[]
  profileStore?: OutreachState['profileStore']
  chain?: OutreachState['chain']
  pending: number
  onChange: (send: OutreachSettings['send']) => void
  onChangeChain: (chain: ChainSettings) => void
  onProfilesChange: (settings?: OutreachSettings) => Promise<void>
  onBeforeProfileAction: () => Promise<void>
  onFlash: (msg: string) => void
  onSend: () => void
  onTest: () => void
  onLoadPromo: () => void
  onResetSent: () => void
  onResetRejected: () => void
  onClearRun: () => void
  onClearActiveDb: () => void
  onClearAllDbs: () => void
  busy: boolean
  canSend: boolean
}) {
  const s = settings.send
  const chainSettings: ChainSettings = settings.chain || {
    enabled: false,
    profiles: [],
    maxEmptyFills: 2,
    maxDurationMin: 120,
  }
  const [selectedProfile, setSelectedProfile] = useState(s.activeProfile || '')
  const [profileName, setProfileName] = useState(s.activeProfile || '')
  const [profileBusy, setProfileBusy] = useState(false)
  const [chainAdd, setChainAdd] = useState('')

  function setChain(next: ChainSettings) {
    onChangeChain(next)
  }

  function moveChain(i: number, dir: -1 | 1) {
    const next = [...chainSettings.profiles]
    const j = i + dir
    if (j < 0 || j >= next.length) return
    ;[next[i], next[j]] = [next[j], next[i]]
    setChain({ ...chainSettings, profiles: next })
  }

  function removeChainAt(i: number) {
    setChain({
      ...chainSettings,
      profiles: chainSettings.profiles.filter((_, idx) => idx !== i),
    })
  }

  function addToChain() {
    const name = (chainAdd || selectedProfile).trim()
    if (!name) {
      onFlash('Pick a profile to add to the chain')
      return
    }
    if (chainSettings.profiles.some((p) => p.toLowerCase() === name.toLowerCase())) {
      onFlash(`“${name}” is already in the chain`)
      return
    }
    if (!profiles.some((p) => p.name.toLowerCase() === name.toLowerCase())) {
      onFlash(`Save profile “${name}” first, then add it to the chain`)
      return
    }
    setChain({ ...chainSettings, profiles: [...chainSettings.profiles, name] })
    setChainAdd('')
  }

  useEffect(() => {
    if (s.activeProfile) {
      setSelectedProfile(s.activeProfile)
      setProfileName(s.activeProfile)
    }
  }, [s.activeProfile])

  const effectiveFrom = s.resendFrom.trim() || vault.from || '-'
  const identityLabel = s.activeProfile
    ? `Profile “${s.activeProfile}”`
    : vault.source === 'profile'
      ? 'Profile key'
      : 'Vault'

  async function onSaveProfile() {
    const name = (profileName || selectedProfile).trim()
    if (!name) {
      onFlash('Enter a profile name first')
      return
    }
    await onBeforeProfileAction()
    setProfileBusy(true)
    const res = await saveOutreachSendProfile(name)
    setProfileBusy(false)
    onFlash(res.message)
    if (res.ok && res.settings) {
      setProfileName(res.settings.send.activeProfile || name)
      setSelectedProfile(res.settings.send.activeProfile || name)
    }
    await onProfilesChange(res.settings)
  }

  async function onLoadProfile() {
    const name = (selectedProfile || profileName).trim()
    if (!name) {
      onFlash('Pick a profile to load')
      return
    }
    await onBeforeProfileAction()
    setProfileBusy(true)
    const res = await loadOutreachSendProfile(name)
    setProfileBusy(false)
    onFlash(res.message)
    if (res.ok && res.settings) {
      setProfileName(res.settings.send.activeProfile)
      setSelectedProfile(res.settings.send.activeProfile)
    }
    await onProfilesChange(res.settings)
  }

  async function onDeleteProfile() {
    const name = (selectedProfile || profileName).trim()
    if (!name) {
      onFlash('Pick a profile to delete')
      return
    }
    if (
      !window.confirm(
        `Are you sure you want to delete the send profile “${name}”?\n\nThis removes the saved profile (from address, copy, pacing). Vault keys for other profiles stay.\n\nClick OK to delete, or Cancel to keep it.`,
      )
    ) {
      return
    }
    await onBeforeProfileAction()
    setProfileBusy(true)
    const res = await deleteOutreachSendProfile(name)
    setProfileBusy(false)
    onFlash(res.message)
    if (res.ok) {
      setSelectedProfile('')
      setProfileName('')
    }
    await onProfilesChange(res.settings)
  }

  function onClearActiveDbClick() {
    const name = profileStore?.name || s.activeProfile || '(default)'
    if (
      !window.confirm(
        `Are you sure you want to clear the database for “${name}”?\n\nThis wipes that account’s known emails, sent list, rejected list, and today’s quota.\nOther accounts stay intact. The profile itself is not deleted.\n\nClick OK to clear, or Cancel to keep the data.`,
      )
    ) {
      return
    }
    onClearActiveDb()
  }

  function onClearAllDbsClick() {
    if (
      !window.confirm(
        'Are you sure you want to clear ALL account databases?\n\nThis wipes known emails, sent, rejected, and quota for every profile store.\nProfile names, API keys, settings, and notes stay.\n\nClick OK to continue, or Cancel to abort.',
      )
    ) {
      return
    }
    if (
      !window.confirm(
        'Final confirmation: clear every account database now?\n\nThis cannot be undone.',
      )
    ) {
      return
    }
    onClearAllDbs()
  }

  return (
    <div className="fit-stack space-y-5">
      <Section title="Send profiles">
        {profileStore && (
          <p className="font-mono text-[11px] text-mist">
            Active store: <span className="text-snow">{profileStore.name}</span>
            {' · '}
            sent {profileStore.sentCount}
            {' · '}
            rejected {profileStore.rejectedCount}
            {typeof profileStore.permanentBlacklistCount === 'number' ? (
              <>
                {' · '}
                permanent block {profileStore.permanentBlacklistCount}
              </>
            ) : null}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <select
            className={`${inputCls} min-w-[160px] flex-1`}
            value={selectedProfile}
            onChange={(e) => {
              setSelectedProfile(e.target.value)
              if (e.target.value) setProfileName(e.target.value)
            }}
          >
            <option value="">{profiles.length ? 'Select profile…' : 'No profiles yet'}</option>
            {profiles.map((p) => (
              <option key={p.name} value={p.name}>
                {p.name}
                {p.keyMasked ? ` · ${p.keyMasked}` : ''}
                {p.from ? ` · ${p.from}` : ''}
              </option>
            ))}
          </select>
          <input
            className={`${inputCls} min-w-[140px] flex-1`}
            value={profileName}
            onChange={(e) => setProfileName(e.target.value)}
            placeholder="New profile name"
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Btn onClick={() => void onLoadProfile()} disabled={busy || profileBusy || !selectedProfile}>
            {profileBusy ? '…' : 'Load'}
          </Btn>
          <Btn onClick={() => void onSaveProfile()} disabled={busy || profileBusy} primary>
            Save profile
          </Btn>
          <Btn
            onClick={() => void onDeleteProfile()}
            disabled={busy || profileBusy || !selectedProfile}
            danger
          >
            Delete
          </Btn>
        </div>
        <div className="mt-2 space-y-2 rounded-xl border border-lineStrong bg-well/40 px-3 py-2.5">
          <div className="flex flex-wrap gap-1.5">
            <Btn onClick={onClearActiveDbClick} disabled={busy || profileBusy} danger>
              Clear this account DB
            </Btn>
            <Btn onClick={onClearAllDbsClick} disabled={busy || profileBusy} danger>
              Clear all account DBs
            </Btn>
          </div>
        </div>
      </Section>

      <Section title="Profile chain · 150 autopilot">
        <Check
          label="Chain profiles on Start (find → clean → send to daily cap → next)"
          checked={chainSettings.enabled}
          onChange={(v) => setChain({ ...chainSettings, enabled: v })}
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Empty-wave limit per profile">
            <input
              className={inputCls}
              type="number"
              min={1}
              max={5}
              value={chainSettings.maxEmptyFills}
              onChange={(e) => setChain({ ...chainSettings, maxEmptyFills: Number(e.target.value) || 2 })}
            />
          </Field>
          <Field label="Chain time budget (minutes)">
            <input
              className={inputCls}
              type="number"
              min={15}
              max={480}
              value={chainSettings.maxDurationMin}
              onChange={(e) => setChain({ ...chainSettings, maxDurationMin: Number(e.target.value) || 120 })}
            />
          </Field>
        </div>
        {chain?.active ? (
          <p className="font-mono text-[11px] text-brass">
            Running {Math.min(chain.index + 1, chain.total)}/{chain.total}
            {chain.current ? ` · ${chain.current}` : ''}
          </p>
        ) : null}
        <div className="space-y-1.5">
          {            chainSettings.profiles.length === 0 ? (
            <EmptyState title="No profiles in chain" />
          ) : (
            chainSettings.profiles.map((name, i) => (
              <div
                key={`${name}-${i}`}
                className="flex flex-wrap items-center gap-1.5 rounded-lg border border-lineStrong bg-panel px-2 py-1.5"
              >
                <span className="w-5 font-mono text-[10px] text-fog">{i + 1}.</span>
                <span className="min-w-0 flex-1 truncate font-mono text-[12px] text-snow">{name}</span>
                <Btn onClick={() => moveChain(i, -1)} disabled={busy || i === 0}>
                  ↑
                </Btn>
                <Btn
                  onClick={() => moveChain(i, 1)}
                  disabled={busy || i === chainSettings.profiles.length - 1}
                >
                  ↓
                </Btn>
                <Btn onClick={() => removeChainAt(i)} disabled={busy} danger>
                  Remove
                </Btn>
              </div>
            ))
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <select
            className={`${inputCls} min-w-[160px] flex-1`}
            value={chainAdd}
            onChange={(e) => setChainAdd(e.target.value)}
          >
            <option value="">Add profile…</option>
            {profiles.map((p) => (
              <option key={p.name} value={p.name}>
                {p.name}
              </option>
            ))}
          </select>
          <Btn onClick={addToChain} disabled={busy || !chainAdd}>
            Add to chain
          </Btn>
        </div>
      </Section>

      <Section title="Resend / identity">
        <div className="rounded-xl border border-lineStrong bg-panel px-3 py-2.5 shadow-card font-mono text-[11px] text-mist space-y-1">
          <div>
            Active: <span className="text-brass">{identityLabel}</span>
          </div>
          <div>
            API key:{' '}
            <span className="text-snow">
              {vault.hasResendKey ? vault.keyMasked : 'missing - set below or open Vault'}
            </span>
          </div>
          <div>
            Effective from: <span className="text-brass">{effectiveFrom}</span>
          </div>
          {(vault.vaultFrom || vault.vaultKeyMasked) && (
            <div className="text-fog">
              Vault fallback: {vault.vaultKeyMasked || 'no key'}
              {vault.vaultFrom ? ` · ${vault.vaultFrom}` : ''}
            </div>
          )}
          <div>
            Pending queue: <span className="text-brass">{pending}</span>
            {assets && (
              <span className="text-fog">
                {' '}
                · subjects.txt: {assets.subjectsCount} · promo: {assets.promoHtmlExists ? 'yes' : 'no'}
              </span>
            )}
          </div>
        </div>
        <Field label="Resend API key">
          <SecretInput
            className={inputCls}
            value={s.resendApiKey || ''}
            onChange={(v) => onChange({ ...s, resendApiKey: v })}
            placeholder="re_…"
            autoComplete="off"
          />
        </Field>
        <Field label="Resend from">
          <input
            className={inputCls}
            value={s.resendFrom || ''}
            onChange={(e) => onChange({ ...s, resendFrom: e.target.value })}
            placeholder="Name <email@domain.com>"
          />
        </Field>
      </Section>

      <Section title="Subject & body">
        <Field label="Subject">
          <input
            className={inputCls}
            value={s.subject}
            onChange={(e) => onChange({ ...s, subject: e.target.value })}
            disabled={s.rotateSubjects}
            placeholder={s.rotateSubjects ? 'Using subjects.txt rotation' : 'Email subject'}
          />
        </Field>
        <Check
          label={`Rotate subjects from subjects.txt (${assets?.subjectsCount ?? 0} lines)`}
          checked={s.rotateSubjects}
          onChange={(v) => onChange({ ...s, rotateSubjects: v })}
        />
        {s.rotateSubjects && assets?.subjectsPreview?.length ? (
          <p className="font-mono text-[10px] text-fog">Preview: {assets.subjectsPreview.join(' · ')}</p>
        ) : null}
        <Check
          label={s.promoHtmlPaths?.length
            ? `Use ${s.promoHtmlPaths.length} rotating promo templates`
            : `Use profile promo template${assets?.promoHtmlPath ? ` (${assets.promoHtmlPath})` : ''}`}
          checked={s.useAssetHtml}
          onChange={(v) => onChange({ ...s, useAssetHtml: v })}
        />
        <div className="flex flex-wrap gap-1.5">
          <Btn onClick={onLoadPromo} disabled={busy}>
            Load promo template into editor
          </Btn>
        </div>
        {!s.useAssetHtml && (
          <Field label="HTML body">
            <textarea
              className={`${inputCls} min-h-[160px]`}
              value={s.html}
              onChange={(e) => onChange({ ...s, html: e.target.value })}
            />
          </Field>
        )}
      </Section>

      <Section title="Pacing & notify">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Daily cap">
            <input
              type="number"
              className={inputCls}
              value={s.dailyCap}
              onChange={(e) => onChange({ ...s, dailyCap: Math.max(1, Number(e.target.value) || 150) })}
            />
          </Field>
          <Field label="Delay between sends (ms)">
            <input
              type="number"
              className={inputCls}
              value={s.delayMs}
              onChange={(e) => onChange({ ...s, delayMs: Math.max(0, Number(e.target.value) || 0) })}
            />
          </Field>
        </div>
        <Check
          label="Keep leftover queue for next day"
          checked={s.autoContinueNextDay}
          onChange={(v) => onChange({ ...s, autoContinueNextDay: v })}
        />
        <Check
          label="Discord notify on each send"
          checked={s.discordNotify}
          onChange={(v) => onChange({ ...s, discordNotify: v })}
        />
      </Section>

      <Field label="Test recipient">
        <input
          type="email"
          className={inputCls}
          value={s.testRecipient || ''}
          onChange={(e) => onChange({ ...s, testRecipient: e.target.value })}
          placeholder="Blank uses the first campaign email"
        />
      </Field>
      <div className="flex flex-wrap gap-1.5">
        <Btn onClick={onTest} disabled={busy}>
          {s.testRecipient?.trim() ? `Test send to ${s.testRecipient.trim()}` : 'Test send (first email)'}
        </Btn>
        <Btn onClick={onSend} primary disabled={busy || !canSend}>
          Send approved
        </Btn>
        <Btn onClick={onResetSent}>Reset sent history</Btn>
        <Btn onClick={onResetRejected}>Reset rejected history</Btn>
        <Btn onClick={onClearRun}>Clear run</Btn>
      </div>
    </div>
  )
}
