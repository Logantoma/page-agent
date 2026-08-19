// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { MultiPageAgent } from '../agent/MultiPageAgent'
import type { ExtConfig } from '../agent/loadAgentConfig'
import { InPageAgentShell } from './InPageAgentShell'

class FakeAgent extends EventTarget {
	status = 'idle'
	dispose = vi.fn(() => this.dispatchEvent(new Event('dispose')))
	setStatus(status: string) {
		this.status = status
		this.dispatchEvent(new Event('statuschange'))
	}
}

class FakePanel {
	mount = vi.fn()
	show = vi.fn()
	hide = vi.fn()
	dispose = vi.fn()
}

describe('InPageAgentShell launcher lifecycle', () => {
	afterEach(() => {
		document.body.replaceChildren()
		Object.defineProperty(document, 'fullscreenElement', { configurable: true, value: null })
	})

	it('resets launcher state when the Agent is disposed externally', async () => {
		const agent = new FakeAgent()
		const panel = new FakePanel()
		const loadConfig = vi.fn<() => Promise<ExtConfig>>().mockResolvedValue({
			baseURL: 'https://example.test',
			model: 'test-model',
		})
		const shell = new InPageAgentShell({
			loadConfig,
			createAgent: () => agent as unknown as MultiPageAgent,
			createPanel: () => panel as never,
		})

		await shell.toggle()
		const launcher = document.querySelector<HTMLElement>('#page-agent-inpage-launcher')
		expect(launcher?.dataset.active).toBe('true')
		agent.setStatus('running')
		expect(launcher?.dataset.working).toBe('true')

		agent.dispose()

		expect(launcher?.dataset.active).toBe('false')
		expect(launcher?.dataset.working).toBe('false')
		shell.dispose()
	})
})
