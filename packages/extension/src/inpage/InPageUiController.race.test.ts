// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { SiteUiPolicyV1 } from '../lib/SiteUiPolicy'
import { InPageUiController } from './InPageUiController'

type StorageListener = (
	changes: Record<string, chrome.storage.StorageChange>,
	areaName: string
) => Promise<void>

function deferred<T>() {
	let resolve!: (value: T) => void
	const promise = new Promise<T>((resolver) => {
		resolve = resolver
	})
	return { promise, resolve }
}

describe('InPageUiController async lifecycle', () => {
	afterEach(() => vi.unstubAllGlobals())

	function setup(loadPolicy: () => Promise<SiteUiPolicyV1>) {
		const listeners = new Set<StorageListener>()
		const chromeMock = {
			storage: {
				onChanged: {
					addListener: vi.fn((listener: StorageListener) => listeners.add(listener)),
					removeListener: vi.fn((listener: StorageListener) => listeners.delete(listener)),
				},
			},
		}
		vi.stubGlobal('chrome', chromeMock)
		const shell = { dispose: vi.fn() }
		const createShell = vi.fn(() => shell)
		const controller = new InPageUiController({
			getUrl: () => 'https://example.com/path',
			loadPolicy,
			createShell: createShell as never,
		})
		return { chromeMock, controller, createShell, listeners, shell }
	}

	it('does not create a shell after disposal while policy loading is pending', async () => {
		const pending = deferred<SiteUiPolicyV1>()
		const { chromeMock, controller, createShell } = setup(() => pending.promise)

		const startPromise = controller.start()
		controller.dispose()
		pending.resolve({ version: 1, disabledOrigins: [] })
		await startPromise

		expect(createShell).not.toHaveBeenCalled()
		expect(chromeMock.storage.onChanged.removeListener).toHaveBeenCalledOnce()
	})

	it('ignores an older enabled result after a newer disabled sync completes', async () => {
		const first = deferred<SiteUiPolicyV1>()
		const second = deferred<SiteUiPolicyV1>()
		const loadPolicy = vi
			.fn<() => Promise<SiteUiPolicyV1>>()
			.mockImplementationOnce(() => first.promise)
			.mockImplementationOnce(() => second.promise)
		const { controller, createShell } = setup(loadPolicy)

		const older = controller.start()
		const newer = controller.sync()
		second.resolve({ version: 1, disabledOrigins: ['https://example.com'] })
		await newer
		first.resolve({ version: 1, disabledOrigins: [] })
		await older

		expect(createShell).not.toHaveBeenCalled()
		controller.dispose()
	})

	it('registers its storage listener only once when start is called repeatedly', async () => {
		const { chromeMock, controller } = setup(async () => ({ version: 1, disabledOrigins: [] }))

		await controller.start()
		await controller.start()

		expect(chromeMock.storage.onChanged.addListener).toHaveBeenCalledOnce()
		controller.dispose()
	})
})
