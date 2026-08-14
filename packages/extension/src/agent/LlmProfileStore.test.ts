import { describe, expect, it } from 'vitest'

import {
	createMigratedProfile,
	parseLlmProfileStore,
	resolveActiveProfile,
	serializeLlmProfileConfig,
} from './LlmProfileStore'

describe('LlmProfileStore', () => {
	it('persists only the supported serializable LLM fields', () => {
		const config = serializeLlmProfileConfig({
			baseURL: 'https://example.com/v1',
			model: 'model',
			apiKey: 'secret',
			temperature: 0.2,
			maxRetries: 4,
			disableNamedToolChoice: true,
			transformRequestBody: (body) => body,
			customFetch: fetch,
		})

		expect(config).toEqual({
			baseURL: 'https://example.com/v1',
			model: 'model',
			apiKey: 'secret',
			temperature: 0.2,
			maxRetries: 4,
			disableNamedToolChoice: true,
		})
		expect(JSON.stringify(config)).not.toContain('transformRequestBody')
		expect(JSON.stringify(config)).not.toContain('customFetch')
	})

	it('creates a stable migrated profile', () => {
		const config = { baseURL: 'https://api.siliconflow.cn/v1', model: 'Qwen/Qwen3' }

		expect(createMigratedProfile(config)).toEqual(createMigratedProfile(config))
		expect(createMigratedProfile(config)).toMatchObject({ provider: 'siliconflow' })
	})

	it('rejects malformed profile-store envelopes', () => {
		expect(parseLlmProfileStore({ version: 1, activeProfileId: 'x', profiles: [{}] })).toBeNull()
	})

	it('repairs an active id only when a valid fallback profile exists', () => {
		const store = {
			version: 1 as const,
			activeProfileId: 'missing',
			profiles: [
				{
					id: 'first',
					name: 'First',
					provider: 'custom' as const,
					config: { baseURL: 'https://example.com', model: 'model' },
				},
			],
		}

		expect(resolveActiveProfile(store)).toMatchObject({
			repaired: true,
			profile: { id: 'first' },
			store: { activeProfileId: 'first' },
		})
	})
})
