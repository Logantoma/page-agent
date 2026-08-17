// @vitest-environment happy-dom
import { act } from 'react'
import { type Root, createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { ExtConfig } from './loadAgentConfig'
import type { UseAgentResult } from './useAgent'
import { useAgent } from './useAgent'

const mocks = vi.hoisted(() => ({
	loadAgentConfig: vi.fn(),
	agents: [] as any[],
}))
const loadAgentConfig = mocks.loadAgentConfig as ReturnType<typeof vi.fn<() => Promise<ExtConfig>>>
const agents = mocks.agents

vi.mock('./loadAgentConfig', async (importOriginal) => ({
	...(await importOriginal<typeof import('./loadAgentConfig')>()),
	loadAgentConfig: mocks.loadAgentConfig,
}))
vi.mock('./MultiPageAgent', () => ({
	MultiPageAgent: class FakeAgent extends EventTarget {
		status = 'idle'
		dispose = vi.fn()
		execute = vi.fn(async () => ({ success: true, data: 'ok' }))
		stop = vi.fn()
		history: [] = []
		constructor() {
			super()
			mocks.agents.push(this)
		}
		setStatus(status: string) {
			this.status = status
			this.dispatchEvent(new Event('statuschange'))
		}
	},
}))

let latest: UseAgentResult | null = null
let root: Root
let container: HTMLDivElement
let changeListeners = new Set<
	(changes: Record<string, chrome.storage.StorageChange>, area: string) => void
>()
const get = vi.fn()
const set = vi.fn()

function Harness() {
	latest = useAgent()
	return null
}

async function renderHarness() {
	container = document.createElement('div')
	document.body.append(container)
	root = createRoot(container)
	await act(async () => root.render(<Harness />))
}

async function flush() {
	await act(async () => await Promise.resolve())
}

describe('useAgent lifecycle', () => {
	beforeEach(() => {
		latest = null
		mocks.agents.length = 0
		changeListeners = new Set()
		get.mockReset()
		set.mockReset()
		set.mockResolvedValue(undefined)
		vi.stubGlobal('chrome', {
			storage: {
				local: { get, set },
				onChanged: {
					addListener: (listener: never) => changeListeners.add(listener),
					removeListener: (listener: never) => changeListeners.delete(listener),
				},
			},
		})
	})

	afterEach(async () => {
		await act(async () => root?.unmount())
		container?.remove()
	})

	it('waits for initial transition before executing', async () => {
		let resolveConfig!: (config: ExtConfig) => void
		loadAgentConfig.mockReturnValueOnce(new Promise((resolve) => (resolveConfig = resolve)))
		await renderHarness()
		const execution = latest!.execute('task')
		expect(agents).toHaveLength(0)

		resolveConfig({ baseURL: 'https://example.com', model: 'first' })
		await flush()
		await execution
		expect(agents).toHaveLength(1)
		expect(agents[0].execute).toHaveBeenCalledWith('task')
	})

	it('rejects configure while the current Agent is running without storage writes', async () => {
		loadAgentConfig.mockResolvedValue({ baseURL: 'https://example.com', model: 'first' })
		await renderHarness()
		await flush()
		agents[0].setStatus('running')

		await expect(
			latest!.configure({ baseURL: 'https://example.com', model: 'next' })
		).rejects.toThrow('Cannot change configuration')
		expect(set).not.toHaveBeenCalled()
		expect(agents[0].dispose).not.toHaveBeenCalled()
	})

	it('ignores non-local storage events', async () => {
		loadAgentConfig.mockResolvedValue({ baseURL: 'https://example.com', model: 'first' })
		await renderHarness()
		await flush()
		changeListeners.forEach((listener) =>
			listener({ language: {} as chrome.storage.StorageChange }, 'sync')
		)
		await flush()
		expect(agents).toHaveLength(1)
	})

	it('rejects profile switching while running without changing storage', async () => {
		loadAgentConfig.mockResolvedValue({ baseURL: 'https://example.com', model: 'first' })
		await renderHarness()
		await flush()
		agents[0].setStatus('running')

		await expect(latest!.switchProfile('builtin:demo')).rejects.toThrow(
			'Cannot change configuration'
		)
		expect(set).not.toHaveBeenCalled()
	})

	it('rejects an unknown profile id without storage writes', async () => {
		loadAgentConfig.mockResolvedValue({ baseURL: 'https://example.com', model: 'first' })
		get.mockResolvedValue({
			llmProfileStoreV1: {
				version: 1,
				activeProfileId: 'known',
				profiles: [
					{
						id: 'known',
						name: 'Known',
						provider: 'custom',
						config: { baseURL: 'https://example.com', model: 'first' },
					},
				],
			},
		})
		await renderHarness()
		await flush()

		await expect(latest!.switchProfile('missing')).rejects.toThrow('Unknown LLM profile')
		expect(set).not.toHaveBeenCalled()
	})

	it('persists configure changes in one coherent storage snapshot', async () => {
		loadAgentConfig.mockResolvedValue({ baseURL: 'https://example.com', model: 'first' })
		get.mockResolvedValue({})
		await renderHarness()
		await flush()

		await latest!.configure({
			baseURL: 'https://next.example.com',
			model: 'next',
			language: undefined,
			maxSteps: 10,
		})

		expect(set).toHaveBeenCalledTimes(1)
		expect(set).toHaveBeenCalledWith(
			expect.objectContaining({
				language: null,
				advancedConfig: expect.objectContaining({ maxSteps: 10 }),
			})
		)
	})

	it('does not execute on the old Agent while a local config transition is installing', async () => {
		loadAgentConfig.mockResolvedValueOnce({ baseURL: 'https://example.com', model: 'first' })
		let resolveNext!: (config: ExtConfig) => void
		loadAgentConfig.mockReturnValueOnce(new Promise((resolve) => (resolveNext = resolve)))
		loadAgentConfig.mockResolvedValue({ baseURL: 'https://example.com', model: 'second' })
		await renderHarness()
		await flush()
		const oldAgent = agents[0]

		changeListeners.forEach((listener) =>
			listener({ llmProfileStoreV1: {} as chrome.storage.StorageChange }, 'local')
		)
		const execution = latest!.execute('next task')
		await flush()
		expect(oldAgent.execute).not.toHaveBeenCalled()

		resolveNext({ baseURL: 'https://example.com', model: 'second' })
		await execution
		expect(agents).toHaveLength(2)
		expect(oldAgent.execute).not.toHaveBeenCalled()
		expect(agents[1].execute).toHaveBeenCalledWith('next task')
	})

	it('joins a second storage trigger while a replacement is installing', async () => {
		loadAgentConfig.mockResolvedValueOnce({ baseURL: 'https://example.com', model: 'first' })
		let resolveNext!: (config: ExtConfig) => void
		loadAgentConfig.mockReturnValueOnce(new Promise((resolve) => (resolveNext = resolve)))
		await renderHarness()
		await flush()
		const oldAgent = agents[0]
		changeListeners.forEach((listener) =>
			listener({ language: {} as chrome.storage.StorageChange }, 'local')
		)
		changeListeners.forEach((listener) =>
			listener({ advancedConfig: {} as chrome.storage.StorageChange }, 'local')
		)
		const execution = latest!.execute('joined task')
		expect(oldAgent.execute).not.toHaveBeenCalled()

		resolveNext({ baseURL: 'https://example.com', model: 'second' })
		await execution
		expect(agents).toHaveLength(2)
		expect(oldAgent.execute).not.toHaveBeenCalled()
		expect(agents[1].execute).toHaveBeenCalledWith('joined task')
	})

	it('does not replace an Agent when a relevant event has the same effective config', async () => {
		loadAgentConfig.mockResolvedValue({ baseURL: 'https://example.com', model: 'first' })
		await renderHarness()
		await flush()
		const agent = agents[0]
		changeListeners.forEach((listener) =>
			listener({ llmProfileStoreV1: {} as chrome.storage.StorageChange }, 'local')
		)
		await flush()
		expect(agents).toHaveLength(1)
		expect(agent.dispose).not.toHaveBeenCalled()
	})

	it('defers repeated running changes and installs only the latest replacement after completion', async () => {
		loadAgentConfig.mockResolvedValueOnce({ baseURL: 'https://example.com', model: 'first' })
		loadAgentConfig.mockResolvedValue({ baseURL: 'https://example.com', model: 'latest' })
		await renderHarness()
		await flush()
		const oldAgent = agents[0]
		oldAgent.setStatus('running')
		changeListeners.forEach((listener) =>
			listener({ language: {} as chrome.storage.StorageChange }, 'local')
		)
		changeListeners.forEach((listener) =>
			listener({ llmProfileStoreV1: {} as chrome.storage.StorageChange }, 'local')
		)
		expect(oldAgent.dispose).not.toHaveBeenCalled()

		oldAgent.setStatus('completed')
		await flush()
		expect(agents).toHaveLength(2)
		expect(agents[1].execute).not.toHaveBeenCalled()
	})

	it('collapses dirty changes and leaves the latest effective config installed', async () => {
		loadAgentConfig.mockResolvedValueOnce({ baseURL: 'https://example.com', model: 'A' })
		let resolveB!: (config: ExtConfig) => void
		loadAgentConfig.mockReturnValueOnce(new Promise((resolve) => (resolveB = resolve)))
		loadAgentConfig.mockResolvedValue({ baseURL: 'https://example.com', model: 'D' })
		await renderHarness()
		await flush()
		changeListeners.forEach((listener) =>
			listener({ llmProfileStoreV1: {} as chrome.storage.StorageChange }, 'local')
		)
		changeListeners.forEach((listener) =>
			listener({ language: {} as chrome.storage.StorageChange }, 'local')
		)
		changeListeners.forEach((listener) =>
			listener({ advancedConfig: {} as chrome.storage.StorageChange }, 'local')
		)

		resolveB({ baseURL: 'https://example.com', model: 'B' })
		await flush()
		await flush()
		expect(latest!.config?.model).toBe('D')
		expect(agents.at(-1)).toBeDefined()
	})

	it('coalesces configure and its own storage change into one replacement', async () => {
		loadAgentConfig.mockResolvedValueOnce({ baseURL: 'https://example.com', model: 'first' })
		loadAgentConfig.mockResolvedValue({ baseURL: 'https://example.com', model: 'next' })
		get.mockResolvedValue({})
		set.mockImplementation(async () => {
			changeListeners.forEach((listener) =>
				listener({ llmProfileStoreV1: {} as chrome.storage.StorageChange }, 'local')
			)
		})
		await renderHarness()
		await flush()

		await latest!.configure({ baseURL: 'https://example.com', model: 'next' })
		expect(agents).toHaveLength(2)
		expect(agents[0].dispose).toHaveBeenCalledOnce()
	})
})
