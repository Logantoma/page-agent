import { beforeEach, describe, expect, it, vi } from 'vitest'

import { LLM_PROFILE_STORE_KEY, type LlmProfileStoreV1 } from './LlmProfileStore'
import { readPersistedProfileStore, writeProfileStoreVerified } from './LlmProfilePersistence'

const store: LlmProfileStoreV1 = {
	version: 1,
	activeProfileId: 'custom',
	profiles: [
		{
			id: 'custom',
			name: 'Custom',
			provider: 'custom',
			config: { baseURL: 'https://example.com/v1', model: 'model' },
		},
	],
}

describe('LlmProfilePersistence', () => {
	let state: Record<string, unknown>
	const get = vi.fn()
	const set = vi.fn()

	beforeEach(() => {
		state = {}
		get.mockReset()
		set.mockReset()
		get.mockImplementation(async (key: string) => ({ [key]: state[key] }))
		set.mockImplementation(async (value: Record<string, unknown>) => {
			Object.assign(state, value)
		})
		vi.stubGlobal('chrome', { storage: { local: { get, set } } })
	})

	it('writes a profile store and verifies the persisted value', async () => {
		await expect(writeProfileStoreVerified(store)).resolves.toEqual(store)
		expect(set).toHaveBeenCalledWith({ [LLM_PROFILE_STORE_KEY]: store })
		await expect(readPersistedProfileStore()).resolves.toEqual(store)
	})

	it('surfaces storage write failures', async () => {
		set.mockRejectedValueOnce(new Error('quota'))
		await expect(writeProfileStoreVerified(store)).rejects.toThrow('quota')
	})

	it('rejects when the read-back value does not match the requested store', async () => {
		set.mockResolvedValueOnce(undefined)
		await expect(writeProfileStoreVerified(store)).rejects.toThrow('本地存储未确认写入')
	})
})
