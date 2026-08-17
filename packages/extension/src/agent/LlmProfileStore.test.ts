import { describe, expect, it } from 'vitest'

import {
	canonicalizeLegacyDemoConfig,
	createBuiltinDemoStore,
	isBareDemoConfig,
	parseLlmProfileStore,
	resolveActiveProfile,
	serializeLlmProfileConfig,
	updateActiveProfileConfig,
} from './LlmProfileStore'
import { DEMO_CONFIG, LEGACY_TESTING_ENDPOINTS } from './constants'

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
	})

	it('recognizes the derived built-in demo only without profile-owned fields', () => {
		expect(isBareDemoConfig(serializeLlmProfileConfig(DEMO_CONFIG))).toBe(true)
		expect(isBareDemoConfig({ ...DEMO_CONFIG, disableNamedToolChoice: false })).toBe(false)
	})

	it('canonicalizes a legacy demo endpoint while retaining all overrides', () => {
		const config = canonicalizeLegacyDemoConfig({
			baseURL: LEGACY_TESTING_ENDPOINTS[0],
			model: 'old-model',
			maxRetries: 2,
		})

		expect(config).toMatchObject({ ...DEMO_CONFIG, maxRetries: 2 })
	})

	it('rejects malformed profile-store envelopes', () => {
		expect(parseLlmProfileStore({ version: 1, activeProfileId: 'x', profiles: [{}] })).toBeNull()
	})

	it('repairs an empty store to the derived built-in demo profile', () => {
		expect(
			resolveActiveProfile({ version: 1, activeProfileId: 'missing', profiles: [] })
		).toMatchObject({
			repaired: true,
			store: createBuiltinDemoStore(),
			config: DEMO_CONFIG,
		})
	})

	it('repairs an invalid active id before updating the fallback profile', () => {
		const store = updateActiveProfileConfig(
			{
				version: 1,
				activeProfileId: 'missing',
				profiles: [
					{
						id: 'available',
						name: 'Available',
						provider: 'custom',
						config: { baseURL: 'https://old.example.com', model: 'old' },
					},
				],
			},
			{ baseURL: 'https://new.example.com', model: 'new' }
		)

		expect(store).toMatchObject({
			activeProfileId: 'available',
			profiles: [
				expect.objectContaining({ config: { baseURL: 'https://new.example.com', model: 'new' } }),
			],
		})
	})

	it('preserves inactive profiles when saving the exact built-in demo config', () => {
		const profiles = [
			{
				id: 'a',
				name: 'A',
				provider: 'custom' as const,
				config: { baseURL: 'https://a.example.com', model: 'a' },
			},
			{
				id: 'b',
				name: 'B',
				provider: 'deepseek' as const,
				config: { baseURL: 'https://api.deepseek.com', model: 'b' },
			},
		]

		const store = updateActiveProfileConfig(
			{ version: 1, activeProfileId: 'builtin:demo', profiles },
			DEMO_CONFIG
		)

		expect(store).toEqual({ version: 1, activeProfileId: 'builtin:demo', profiles })
	})

	it('appends a custom config to inactive profiles when the built-in demo is active', () => {
		const profiles = [
			{
				id: 'a',
				name: 'A',
				provider: 'custom' as const,
				config: { baseURL: 'https://a.example.com', model: 'a' },
			},
		]

		const store = updateActiveProfileConfig(
			{ version: 1, activeProfileId: 'builtin:demo', profiles },
			{ baseURL: 'https://custom.example.com', model: 'custom' }
		)

		expect(store).toMatchObject({
			activeProfileId: 'default',
			profiles: [
				profiles[0],
				expect.objectContaining({
					id: 'default',
					config: { baseURL: 'https://custom.example.com', model: 'custom' },
				}),
			],
		})
	})

	it('generates a non-colliding profile id when default already exists', () => {
		const store = updateActiveProfileConfig(
			{
				version: 1,
				activeProfileId: 'builtin:demo',
				profiles: [
					{
						id: 'default',
						name: 'Existing default',
						provider: 'custom',
						config: { baseURL: 'https://existing.example.com', model: 'existing' },
					},
				],
			},
			{ baseURL: 'https://custom.example.com', model: 'custom' }
		)

		expect(store.activeProfileId).toBe('default-2')
		expect(store.profiles.map(({ id }) => id)).toEqual(['default', 'default-2'])
	})
})
