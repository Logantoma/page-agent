// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'

import { Panel } from './Panel'
import type { PanelAgentAdapter } from './types'

class FocusTestAgent extends EventTarget implements PanelAgentAdapter {
	#status: PanelAgentAdapter['status'] = 'idle'
	lastResult = null
	history = [] as const
	task = ''
	onAskUser?: PanelAgentAdapter['onAskUser']

	get status(): PanelAgentAdapter['status'] {
		return this.#status
	}

	setStatus(status: PanelAgentAdapter['status']): void {
		this.#status = status
		this.dispatchEvent(new Event('statuschange'))
	}

	async execute(): Promise<void> {}
	async stop(): Promise<void> {}
	dispose(): void {}
}

describe('Panel input focus policy', () => {
	afterEach(() => {
		vi.useRealTimers()
		document.body.replaceChildren()
	})

	it('keeps the upstream default auto-focus behavior', () => {
		vi.useFakeTimers()
		const pageInput = document.createElement('input')
		document.body.appendChild(pageInput)
		pageInput.focus()

		const agent = new FocusTestAgent()
		const panel = new Panel(agent)
		const taskInput = panel.wrapper.querySelector('input') as HTMLInputElement

		agent.setStatus('running')
		agent.setStatus('completed')
		vi.advanceTimersByTime(100)

		expect(document.activeElement).toBe(taskInput)
		panel.dispose()
	})

	it('preserves the page focus when auto-focus is disabled', () => {
		vi.useFakeTimers()
		const pageInput = document.createElement('input')
		document.body.appendChild(pageInput)
		pageInput.focus()

		const agent = new FocusTestAgent()
		const panel = new Panel(agent, { autoFocusInput: false })

		agent.setStatus('running')
		agent.setStatus('completed')
		vi.advanceTimersByTime(200)

		expect(document.activeElement).toBe(pageInput)
		panel.dispose()
	})
})
