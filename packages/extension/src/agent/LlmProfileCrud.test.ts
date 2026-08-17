import { describe, expect, it } from 'vitest'

import { BUILTIN_DEMO_PROFILE_ID, type LlmProfileStoreV1 } from './LlmProfileStore'
import { createUserProfile, deleteUserProfile, updateUserProfile } from './LlmProfileCrud'

const baseStore: LlmProfileStoreV1 = {
	version: 1,
	activeProfileId: BUILTIN_DEMO_PROFILE_ID,
	profiles: [],
}

describe('LlmProfileCrud', () => {
	it('creates an inactive user profile with a unique id', () => {
		const first = createUserProfile(baseStore, {
			name: 'DeepSeek',
			provider: 'deepseek',
			config: { baseURL: 'https://api.deepseek.com', model: 'deepseek-chat' },
		})
		const second = createUserProfile(first.store, {
			name: 'DeepSeek',
			provider: 'deepseek',
			config: { baseURL: 'https://api.deepseek.com', model: 'deepseek-reasoner' },
		})

		expect(first.profile.id).toBe('deepseek')
		expect(second.profile.id).toBe('deepseek-2')
		expect(second.store.activeProfileId).toBe(BUILTIN_DEMO_PROFILE_ID)
		expect(second.store.profiles).toHaveLength(2)
	})

	it('updates only the requested profile and preserves the active id', () => {
		const created = createUserProfile(baseStore, {
			name: 'Custom',
			provider: 'custom',
			config: { baseURL: 'https://one.example.com', model: 'one' },
		})
		const store = { ...created.store, activeProfileId: created.profile.id }
		const updated = updateUserProfile(store, created.profile.id, {
			name: 'Renamed',
			provider: 'siliconflow',
			config: { baseURL: 'https://api.siliconflow.cn/v1', model: 'model-two' },
		})

		expect(updated.activeProfileId).toBe(created.profile.id)
		expect(updated.profiles[0]).toMatchObject({
			id: created.profile.id,
			name: 'Renamed',
			provider: 'siliconflow',
			config: { baseURL: 'https://api.siliconflow.cn/v1', model: 'model-two' },
		})
	})

	it('deletes an inactive profile without changing the active profile', () => {
		const a = createUserProfile(baseStore, {
			name: 'A',
			provider: 'custom',
			config: { baseURL: 'https://a.example.com', model: 'a' },
		})
		const b = createUserProfile(a.store, {
			name: 'B',
			provider: 'custom',
			config: { baseURL: 'https://b.example.com', model: 'b' },
		})
		const store = { ...b.store, activeProfileId: a.profile.id }
		const deleted = deleteUserProfile(store, b.profile.id)

		expect(deleted.activeProfileId).toBe(a.profile.id)
		expect(deleted.profiles.map(({ id }) => id)).toEqual([a.profile.id])
	})

	it('falls back to the built-in demo when deleting the active profile', () => {
		const created = createUserProfile(baseStore, {
			name: 'Active',
			provider: 'custom',
			config: { baseURL: 'https://active.example.com', model: 'active' },
		})
		const deleted = deleteUserProfile(
			{ ...created.store, activeProfileId: created.profile.id },
			created.profile.id
		)

		expect(deleted.activeProfileId).toBe(BUILTIN_DEMO_PROFILE_ID)
		expect(deleted.profiles).toEqual([])
	})

	it('never allows the derived built-in demo to be edited or deleted', () => {
		expect(() =>
			updateUserProfile(baseStore, BUILTIN_DEMO_PROFILE_ID, {
				name: 'Nope',
				provider: 'custom',
				config: { baseURL: 'https://example.com', model: 'model' },
			})
		).toThrow('built-in demo')
		expect(() => deleteUserProfile(baseStore, BUILTIN_DEMO_PROFILE_ID)).toThrow('built-in demo')
	})
})
