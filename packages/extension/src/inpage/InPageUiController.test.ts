// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { SiteUiPolicyV1 } from '../lib/SiteUiPolicy'
import { SITE_UI_POLICY_STORAGE_KEY } from '../lib/SiteUiPolicy'
import { InPageUiController } from './InPageUiController'

type StorageListener = (
	changes: Record<string, chrome.storage.StorageChange>,
	areaName: string
) => Promise<void>

describe('InPageUiController', () => {
	afterEach(() => vi.unstubAllGlobals())

	function setup(policy: SiteUiPolicyV1) {
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
			loadPolicy: async () => policy,
			createShell: createShell as never,
		})
		return { chromeMock, controller, createShell, listeners, shell }
	}

	it('creates one shell when the site is enabled', async () => {
		const { controller, createShell } = setup({ version: 1, disabledOrigins: [] })
		await controller.start()
		await controller.sync()
		expect(createShell).toHaveBeenCalledOnce()
	})

	it('does not create a shell when the site is disabled', async () => {
		const { controller, createShell } = setup({
			version: 1,
			disabledOrigins: ['https://example.com'],
		})
		await controller.start()
		expect(createShell).not.toHaveBeenCalled()
	})

	it('disposes its shell when policy changes from enabled to disabled', async () => {
		const policy: SiteUiPolicyV1 = { version: 1, disabledOrigins: [] }
		const { controller, listeners, shell } = setup(policy)
		await controller.start()
		policy.disabledOrigins = ['https://example.com']
		await Promise.all(
			[...listeners].map((listener) =>
				listener({ [SITE_UI_POLICY_STORAGE_KEY]: {} as chrome.storage.StorageChange }, 'local')
			)
		)
		expect(shell.dispose).toHaveBeenCalledOnce()
	})

	it('creates a shell when policy changes from disabled to enabled', async () => {
		const policy: SiteUiPolicyV1 = {
			version: 1,
			disabledOrigins: ['https://example.com'],
		}
		const { controller, createShell, listeners } = setup(policy)
		await controller.start()
		policy.disabledOrigins = []
		await Promise.all(
			[...listeners].map((listener) =>
				listener({ [SITE_UI_POLICY_STORAGE_KEY]: {} as chrome.storage.StorageChange }, 'local')
			)
		)
		expect(createShell).toHaveBeenCalledOnce()
	})

	it('ignores unrelated storage changes', async () => {
		const { controller, createShell, listeners } = setup({ version: 1, disabledOrigins: [] })
		await controller.start()
		await Promise.all(
			[...listeners].map((listener) => listener({ language: {} as chrome.storage.StorageChange }, 'local'))
		)
		expect(createShell).toHaveBeenCalledOnce()
	})

	it('removes its listener and disposes its shell', async () => {
		const { chromeMock, controller, shell } = setup({ version: 1, disabledOrigins: [] })
		await controller.start()
		controller.dispose()
		expect(chromeMock.storage.onChanged.removeListener).toHaveBeenCalledOnce()
		expect(shell.dispose).toHaveBeenCalledOnce()
	})
})
