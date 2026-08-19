import { Eye, EyeOff } from 'lucide-react'
import { useCallback, useState } from 'react'

import { ProfileConfigPanel } from '@/components/ProfileConfigPanel'
import { Logo } from '@/components/misc'
import { Button } from '@/components/ui/button'

import { useAgent } from '../../agent/useAgent'
import { SiteUiToggle } from './SiteUiToggle'

export default function App() {
	const [visualTogglePending, setVisualTogglePending] = useState(false)
	const { status, config, configure, switchProfile } = useAgent()

	const visualObservationEnabled = config?.experimentalVisualObservation ?? false
	const isRunning = status === 'running'

	const handleToggleVisualObservation = useCallback(async () => {
		if (!config || isRunning || visualTogglePending) return
		setVisualTogglePending(true)
		try {
			await configure({
				...config,
				experimentalVisualObservation: !visualObservationEnabled,
			})
		} catch (error) {
			console.error('[SidePanel] Failed to toggle visual observation:', error)
		} finally {
			setVisualTogglePending(false)
		}
	}, [config, configure, isRunning, visualObservationEnabled, visualTogglePending])

	return (
		<div className="flex h-screen flex-col bg-background">
			<header className="flex items-center justify-between gap-3 border-b px-3 py-2">
				<div className="flex min-w-0 items-center gap-2">
					<Logo className="size-7 shrink-0" />
					<div className="min-w-0">
						<h1 className="truncate text-base font-semibold">PsySquid Web</h1>
						<p className="truncate text-[11px] text-muted-foreground">设置</p>
					</div>
				</div>

				<Button
					variant={visualObservationEnabled ? 'outline' : 'ghost'}
					size="sm"
					onClick={() => void handleToggleVisualObservation()}
					disabled={!config || isRunning || visualTogglePending}
					className="h-8 gap-1.5 px-2.5 cursor-pointer"
					aria-pressed={visualObservationEnabled}
					aria-label={visualObservationEnabled ? '关闭视觉观察' : '开启视觉观察'}
					title={
						visualObservationEnabled
							? '视觉观察已开启，点击关闭'
							: '视觉观察已关闭，点击开启'
					}
				>
					{visualObservationEnabled ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
					<span className="text-xs">视觉</span>
				</Button>
			</header>

			<div className="flex min-h-0 flex-1 flex-col overflow-hidden">
				<SiteUiToggle />
				<div className="min-h-0 flex-1 overflow-hidden [&>div]:h-full [&>div>header]:hidden">
					<ProfileConfigPanel
						config={config}
						status={status}
						onSave={configure}
						onSwitchProfile={switchProfile}
						onClose={() => {}}
					/>
				</div>
			</div>
		</div>
	)
}
