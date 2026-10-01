import { BridgeOfflinePanel } from './ui/bridge-offline'

export function BridgeBlocker({ onRetry }: { onRetry?: () => void }) {
  return <BridgeOfflinePanel onRetry={onRetry} />
}
