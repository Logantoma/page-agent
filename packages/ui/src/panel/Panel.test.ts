// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'

import { Panel } from './Panel'
import type { PanelAgentAdapter } from './types'

class FakeAgent extends EventTarget implements PanelAgentAdapter {
	status = 'idle' as const
	lastResult = null
	history = [] as const
	task = ''
	onAskUser?: PanelAgentAdapter['onAskUser']

	async execute(): Promise<void> {}
	async stop(): Promise<void> {}
	dispose(): void {}
}

describe('Panel.mount', () => {
	afterEach(() => {
		document.body.replaceChildren()
	})

	it('defaults to document.body', () => {
		const panel = new Panel(new FakeAgent())

		expect(panel.wrapper.parentElement).toBe(document.body)
		panel.dispose()
	})

	it('reparents the same wrapper and is idempotent for its current target', () => {
		const panel = new Panel(new FakeAgent())
		const target = document.createElement('div')
		document.body.appendChild(target)

		panel.mount(target)
		expect(panel.wrapper.parentElement).toBe(target)
		expect(panel.wrapper.getAttribute('data-browser-use-ignore')).toBe('true')
		expect(panel.wrapper.getAttribute('data-page-agent-ignore')).toBe('true')
		const wrapper = panel.wrapper
		panel.mount(target)
		expect(panel.wrapper).toBe(wrapper)
		expect(target.childElementCount).toBe(1)
		panel.dispose()
	})
})
