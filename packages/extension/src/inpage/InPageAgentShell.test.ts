// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { MultiPageAgent } from '../agent/MultiPageAgent'
import type { ExtConfig } from '../agent/loadAgentConfig'
import { InPageAgentShell } from './InPageAgentShell'

class FakeAgent extends EventTarget {
	dispose = vi.fn(() => this.dispatchEvent(new Event('dispose')))
}

class FakePanel {
	show = vi.fn()
	hide = vi.fn()
	dispose = vi.fn()
}

describe('InPageAgentShell', () => {
	afterEach(() => {
		document.body.replaceChildren()
	})

	it('lazy-creates one Agent and toggles its existing Panel', async () => {
		const agent = new FakeAgent()
		const panel = new FakePanel()
		const createAgent = vi.fn(() => agent as unknown as MultiPageAgent)
		const createPanel = vi.fn(() => panel as never)
		const loadConfig = vi.fn<() => Promise<ExtConfig>>().mockResolvedValue({
			baseURL: 'https://example.test',
			model: 'test-model',
		})
		const shell = new InPageAgentShell({ loadConfig, createAgent, createPanel })

		expect(createAgent).not.toHaveBeenCalled()
		await shell.toggle()
		expect(createAgent).toHaveBeenCalledTimes(1)
		expect(createPanel).toHaveBeenCalledTimes(1)
		expect(panel.show).toHaveBeenCalledTimes(1)

		await shell.toggle()
		expect(panel.hide).toHaveBeenCalledTimes(1)
		expect(createAgent).toHaveBeenCalledTimes(1)

		await shell.toggle()
		expect(panel.show).toHaveBeenCalledTimes(2)
		expect(createAgent).toHaveBeenCalledTimes(1)
	})

	it('disposes the Panel, Agent, and launcher only once', async () => {
		const agent = new FakeAgent()
		const panel = new FakePanel()
		const shell = new InPageAgentShell({
			loadConfig: async () => ({ baseURL: 'https://example.test', model: 'test-model' }),
			createAgent: () => agent as unknown as MultiPageAgent,
			createPanel: () => panel as never,
		})
		await shell.toggle()

		shell.dispose()
		shell.dispose()

		expect(panel.dispose).toHaveBeenCalledOnce()
		expect(agent.dispose).toHaveBeenCalledOnce()
		expect(document.querySelector('#page-agent-inpage-launcher')).toBeNull()
	})

	it('cleans up a failed Panel creation and retries with a fresh Agent', async () => {
		const firstAgent = new FakeAgent()
		const secondAgent = new FakeAgent()
		const removeListener = vi.spyOn(firstAgent, 'removeEventListener')
		const panel = new FakePanel()
		const createAgent = vi
			.fn()
			.mockReturnValueOnce(firstAgent as unknown as MultiPageAgent)
			.mockReturnValueOnce(secondAgent as unknown as MultiPageAgent)
		const createPanel = vi
			.fn()
			.mockImplementationOnce(() => {
				throw new Error('Panel construction failed')
			})
			.mockReturnValueOnce(panel as never)
		const shell = new InPageAgentShell({
			loadConfig: async () => ({ baseURL: 'https://example.test', model: 'test-model' }),
			createAgent,
			createPanel,
		})

		await expect(shell.toggle()).rejects.toThrow('Panel construction failed')
		expect(firstAgent.dispose).toHaveBeenCalledOnce()
		expect(removeListener).toHaveBeenCalledWith('dispose', expect.any(Function))

		await expect(shell.toggle()).resolves.toBeUndefined()
		expect(createAgent).toHaveBeenCalledTimes(2)
		expect(panel.show).toHaveBeenCalledOnce()
	})

	it('cleans up a Panel when showing it fails and remains retryable', async () => {
		const firstAgent = new FakeAgent()
		const secondAgent = new FakeAgent()
		const failingPanel = new FakePanel()
		failingPanel.show.mockImplementationOnce(() => {
			throw new Error('Panel display failed')
		})
		const nextPanel = new FakePanel()
		const shell = new InPageAgentShell({
			loadConfig: async () => ({ baseURL: 'https://example.test', model: 'test-model' }),
			createAgent: vi
				.fn()
				.mockReturnValueOnce(firstAgent as unknown as MultiPageAgent)
				.mockReturnValueOnce(secondAgent as unknown as MultiPageAgent),
			createPanel: vi
				.fn()
				.mockReturnValueOnce(failingPanel as never)
				.mockReturnValueOnce(nextPanel as never),
		})

		await expect(shell.toggle()).rejects.toThrow('Panel display failed')
		expect(failingPanel.dispose).toHaveBeenCalledOnce()
		expect(firstAgent.dispose).toHaveBeenCalledOnce()

		await expect(shell.toggle()).resolves.toBeUndefined()
		expect(nextPanel.show).toHaveBeenCalledOnce()
	})
})
