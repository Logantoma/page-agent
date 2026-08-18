import type { AgentStatus } from '@page-agent/core'
import { Motion } from 'ai-motion'
import { useEffect, useRef } from 'react'

import { TypingAnimation } from '@/components/ui/typing-animation'
import { cn } from '@/lib/utils'

// Status dot indicator
export function StatusDot({ status }: { status: AgentStatus }) {
	const colorClass = {
		idle: 'bg-muted-foreground',
		running: 'bg-blue-500',
		completed: 'bg-green-500',
		error: 'bg-destructive',
		stopped: 'bg-muted-foreground',
	}[status]

	const label = {
		idle: '就绪',
		running: '运行中',
		completed: '已完成',
		error: '出错',
		stopped: '已停止',
	}[status]

	return (
		<div className="flex items-center gap-1.5 mr-2">
			<span
				className={cn('size-2 rounded-full', colorClass, status === 'running' && 'animate-pulse')}
			/>
			<span className="text-xs text-muted-foreground">{label}</span>
		</div>
	)
}

export function Logo({ className }: { className?: string }) {
	return <img src="/assets/psysquid.png" alt="PsySquid Web" className={cn('', className)} />
}

// Full-screen ai-motion glow overlay, shown only while running
export function MotionOverlay({ active }: { active: boolean }) {
	const containerRef = useRef<HTMLDivElement>(null)
	const motionRef = useRef<Motion | null>(null)

	useEffect(() => {
		try {
			const mode = document.documentElement.classList.contains('dark') ? 'dark' : 'light'
			const motion = new Motion({
				mode,
				borderWidth: 4,
				borderRadius: 14,
				glowWidth: mode === 'dark' ? 120 : 60,
				styles: { position: 'absolute', inset: '0' },
			})
			motionRef.current = motion
			containerRef.current!.appendChild(motion.element)
			motion.autoResize(containerRef.current!)
		} catch (e) {
			console.warn('[MotionOverlay] Motion unavailable:', e)
		}

		return () => {
			motionRef.current?.dispose()
			motionRef.current = null
		}
	}, [])

	useEffect(() => {
		const motion = motionRef.current
		if (!motion) return

		let disposed = false
		if (active) {
			motion.start()
			motion.fadeIn()
		} else {
			motion.fadeOut().then(() => !disposed && motion.pause())
		}
		return () => {
			disposed = true
		}
	}, [active])

	return (
		<div
			ref={containerRef}
			className="pointer-events-none absolute inset-0 z-10 opacity-60 overflow-hidden"
			style={{ display: active ? undefined : 'none' }}
		/>
	)
}

// Legacy empty state retained for compatibility with upstream components.
export function EmptyState() {
	return (
		<div className="flex flex-col items-center justify-center h-full gap-4 text-center px-6">
			<div className="relative select-none pointer-events-none">
				<div className="absolute inset-0 -m-6 rounded-full bg-[conic-gradient(from_180deg,oklch(0.55_0.2_280),oklch(0.5_0.15_230),oklch(0.6_0.18_310),oklch(0.55_0.2_280))] blur-2xl animate-[glow-a_5s_ease-in-out_infinite]" />
				<div className="absolute inset-0 -m-6 rounded-full bg-[conic-gradient(from_0deg,oklch(0.55_0.18_160),oklch(0.5_0.2_200),oklch(0.6_0.15_120),oklch(0.55_0.18_160))] blur-2xl animate-[glow-b_5s_ease-in-out_infinite]" />
				<Logo className="relative size-20 opacity-80" />
			</div>
			<div>
				<h2 className="text-base font-medium text-foreground mb-1">PsySquid Web</h2>
				<TypingAnimation
					className="text-sm text-muted-foreground"
					words={[
						'配置模型与网页操作能力',
						'执行跨页面的多步骤任务',
						'使用视觉观察理解复杂页面',
					]}
					cursorStyle="underscore"
					loop
					startOnView={false}
					typeSpeed={20}
					deleteSpeed={10}
					pauseDelay={3000}
				/>
			</div>
		</div>
	)
}
