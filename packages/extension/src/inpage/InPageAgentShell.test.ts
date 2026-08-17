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

describe('InPageAgentShell', () => {
	afterEach(() => {
		document.body.replaceChildren()
		Object.defineProperty(document, 'fullscreenElement', { configurable: true, value: null })
	})

	function setFullscreenElement(element: HTMLElement | null): void {
		Object.defineProperty(document, 'fullscreenElement', { configurable: true, value: element })
		document.dispatchEvent(new Event('fullscreenchange'))
	}

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

	it('reparents the launcher and existing Panel when fullscreen changes', async () => {
		const agent = new FakeAgent()
		const panel = new FakePanel()
		const createAgent = vi.fn(() => agent as unknown as MultiPageAgent)
		const createPanel = vi.fn(() => panel as never)
		const shell = new InPageAgentShell({
			loadConfig: async () => ({ baseURL: 'https://example.test', model: 'test-model' }),
			createAgent,
			createPanel,
		})
		const fullscreenRoot = document.createElement('div')
		document.body.appendChild(fullscreenRoot)

		expect(document.querySelector('#page-agent-inpage-launcher')?.parentElement).toBe(document.body)
		await shell.toggle()
		expect(panel.mount).toHaveBeenLastCalledWith(document.body)

		setFullscreenElement(fullscreenRoot)
		const launcher = document.querySelector('#page-agent-inpage-launcher')!
		expect(launcher.parentElement).toBe(fullscreenRoot)
		expect(launcher.getAttribute('data-browser-use-ignore')).toBe('true')
		expect(launcher.getAttribute('data-page-agent-ignore')).toBe('true')
		expect(panel.mount).toHaveBeenLastCalledWith(fullscreenRoot)

		setFullscreenElement(null)
		expect(document.querySelector('#page-agent-inpage-launcher')?.parentElement).toBe(document.body)
		expect(panel.mount).toHaveBeenLastCalledWith(document.body)
		expect(createAgent).toHaveBeenCalledTimes(1)
		expect(createPanel).toHaveBeenCalledTimes(1)
		shell.dispose()
	})

	it('mounts the first lazy Panel into an active fullscreen element', async () => {
		const fullscreenRoot = document.createElement('div')
		document.body.appendChild(fullscreenRoot)
		setFullscreenElement(fullscreenRoot)
		const panel = new FakePanel()
		const shell = new InPageAgentShell({
			loadConfig: async () => ({ baseURL: 'https://example.test', model: 'test-model' }),
			createAgent: () => new FakeAgent() as unknown as MultiPageAgent,
			createPanel: () => panel as never,
		})

		expect(document.querySelector('#page-agent-inpage-launcher')?.parentElement).toBe(
			fullscreenRoot
		)
		await shell.toggle()
		expect(panel.mount).toHaveBeenCalledWith(fullscreenRoot)
		shell.dispose()
	})

	it('removes its fullscreen listener on disposal', () => {
		const removeListener = vi.spyOn(document, 'removeEventListener')
		const shell = new InPageAgentShell()

		shell.dispose()
		expect(removeListener).toHaveBeenCalledWith('fullscreenchange', expect.any(Function))
	})

	it('recycles an idle Agent and Panel when relevant storage changes', async () => {
		const listeners = new Set<
			(changes: Record<string, chrome.storage.StorageChange>, area: string) => void
		>()
		vi.stubGlobal('chrome', {
			storage: {
				onChanged: {
					addListener: (listener: never) => listeners.add(listener),
					removeListener: (listener: never) => listeners.delete(listener),
				},
			},
		})
		const agent = new FakeAgent()
		const panel = new FakePanel()
		const shell = new InPageAgentShell({
			loadConfig: async () => ({ baseURL: 'https://example.test', model: 'test-model' }),
			createAgent: () => agent as unknown as MultiPageAgent,
			createPanel: () => panel as never,
		})
		await shell.toggle()

		listeners.forEach((listener) =>
			listener({ llmProfileStoreV1: {} as chrome.storage.StorageChange }, 'local')
		)
		expect(panel.dispose).toHaveBeenCalledOnce()
		expect(agent.dispose).toHaveBeenCalledOnce()
		expect(document.querySelector('#page-agent-inpage-launcher')).not.toBeNull()
		shell.dispose()
	})

	it('defers repeated storage changes until a running Agent reaches a terminal status', async () => {
		const listeners = new Set<
			(changes: Record<string, chrome.storage.StorageChange>, area: string) => void
		>()
		vi.stubGlobal('chrome', {
			storage: {
				onChanged: {
					addListener: (listener: never) => listeners.add(listener),
					removeListener: (listener: never) => listeners.delete(listener),
				},
			},
		})
		const agent = new FakeAgent()
		const panel = new FakePanel()
		const shell = new InPageAgentShell({
			loadConfig: async () => ({ baseURL: 'https://example.test', model: 'test-model' }),
			createAgent: () => agent as unknown as MultiPageAgent,
			createPanel: () => panel as never,
		})
		await shell.toggle()
		agent.setStatus('running')
		listeners.forEach((listener) =>
			listener({ language: {} as chrome.storage.StorageChange }, 'local')
		)
		listeners.forEach((listener) =>
			listener({ advancedConfig: {} as chrome.storage.StorageChange }, 'local')
		)
		expect(agent.dispose).not.toHaveBeenCalled()

		agent.setStatus('completed')
		expect(agent.dispose).toHaveBeenCalledOnce()
		expect(panel.dispose).toHaveBeenCalledOnce()
		shell.dispose()
	})
})
