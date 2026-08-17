import { beforeEach, describe, expect, it, vi } from 'vitest'

import { BUILTIN_DEMO_PROFILE_ID, LLM_PROFILE_STORE_KEY } from './LlmProfileStore'
import { DEMO_BASE_URL, DEMO_CONFIG, DEMO_MODEL, LEGACY_TESTING_ENDPOINTS } from './constants'
import { loadAgentConfig } from './loadAgentConfig'

describe('loadAgentConfig', () => {
	const get = vi.fn()
	const set = vi.fn()

	beforeEach(() => {
		get.mockReset()
		set.mockReset()
		set.mockResolvedValue(undefined)
		vi.stubGlobal('chrome', { storage: { local: { get, set } } })
	})

	it('migrates a legacy config into one profile-store envelope', async () => {
		get.mockResolvedValue({
			llmConfig: {
				baseURL: 'https://api.deepseek.com',
				model: 'deepseek-v4-flash',
				apiKey: 'secret',
				temperature: 0.4,
				maxRetries: 3,
			},
			language: 'zh-CN',
			advancedConfig: { maxSteps: 7, systemInstruction: 'Use concise answers.' },
		})

		await expect(loadAgentConfig()).resolves.toEqual({
			baseURL: 'https://api.deepseek.com',
			model: 'deepseek-v4-flash',
			apiKey: 'secret',
			temperature: 0.4,
			maxRetries: 3,
			language: 'zh-CN',
			maxSteps: 7,
			systemInstruction: 'Use concise answers.',
		})
		expect(set).toHaveBeenCalledWith({
			[LLM_PROFILE_STORE_KEY]: expect.objectContaining({
				activeProfileId: 'legacy-imported',
				profiles: [
					expect.objectContaining({
						name: 'Migrated Page Agent Configuration',
						provider: 'deepseek',
						config: expect.objectContaining({ temperature: 0.4, maxRetries: 3 }),
					}),
				],
			}),
		})
	})

	it('gives the legacy advanced disable setting precedence during migration', async () => {
		get.mockResolvedValue({
			llmConfig: {
				baseURL: 'https://example.com/v1',
				model: 'example',
				disableNamedToolChoice: false,
			},
			advancedConfig: { disableNamedToolChoice: true },
		})

		await expect(loadAgentConfig()).resolves.toMatchObject({ disableNamedToolChoice: true })
		expect(set).toHaveBeenCalledWith({
			[LLM_PROFILE_STORE_KEY]: expect.objectContaining({
				profiles: [
					expect.objectContaining({
						config: expect.objectContaining({ disableNamedToolChoice: true }),
					}),
				],
			}),
		})
	})

	it('uses a valid profile store as the sole source of LLM compatibility settings', async () => {
		get.mockResolvedValue({
			[LLM_PROFILE_STORE_KEY]: {
				version: 1,
				activeProfileId: 'primary',
				profiles: [
					{
						id: 'primary',
						name: 'Primary',
						provider: 'custom',
						config: {
							baseURL: 'https://example.com/v1',
							model: 'primary-model',
							disableNamedToolChoice: false,
						},
					},
				],
			},
			advancedConfig: { disableNamedToolChoice: true, maxSteps: 12 },
		})

		await expect(loadAgentConfig()).resolves.toEqual({
			baseURL: 'https://example.com/v1',
			model: 'primary-model',
			disableNamedToolChoice: false,
			maxSteps: 12,
			language: undefined,
		})
		expect(set).not.toHaveBeenCalled()
	})

	it('migrates a bare current demo config to the derived built-in profile', async () => {
		get.mockResolvedValue({ llmConfig: DEMO_CONFIG })

		await expect(loadAgentConfig()).resolves.toEqual({ ...DEMO_CONFIG, language: undefined })
		expect(set).toHaveBeenCalledWith({
			[LLM_PROFILE_STORE_KEY]: {
				version: 1,
				activeProfileId: BUILTIN_DEMO_PROFILE_ID,
				profiles: [],
			},
		})
	})

	it('canonicalizes a bare legacy demo endpoint to the derived built-in profile', async () => {
		get.mockResolvedValue({
			llmConfig: { baseURL: LEGACY_TESTING_ENDPOINTS[0], model: 'old-model' },
		})

		await expect(loadAgentConfig()).resolves.toEqual({ ...DEMO_CONFIG, language: undefined })
		expect(set).toHaveBeenCalledWith({
			[LLM_PROFILE_STORE_KEY]: expect.objectContaining({
				activeProfileId: BUILTIN_DEMO_PROFILE_ID,
				profiles: [],
			}),
		})
	})

	it('keeps demo temperature overrides in a persisted user profile', async () => {
		get.mockResolvedValue({
			llmConfig: { ...DEMO_CONFIG, temperature: 0.7 },
		})

		await expect(loadAgentConfig()).resolves.toEqual({
			...DEMO_CONFIG,
			temperature: 0.7,
			language: undefined,
		})
		expect(set).toHaveBeenCalledWith({
			[LLM_PROFILE_STORE_KEY]: expect.objectContaining({
				activeProfileId: 'legacy-imported',
				profiles: [
					expect.objectContaining({ config: expect.objectContaining({ temperature: 0.7 }) }),
				],
			}),
		})
	})

	it('keeps demo retry and named-tool-choice overrides in a persisted user profile', async () => {
		get.mockResolvedValue({
			llmConfig: { ...DEMO_CONFIG, maxRetries: 5, disableNamedToolChoice: false },
		})

		await expect(loadAgentConfig()).resolves.toMatchObject({
			maxRetries: 5,
			disableNamedToolChoice: false,
		})
		expect(set).toHaveBeenCalledWith({
			[LLM_PROFILE_STORE_KEY]: expect.objectContaining({ activeProfileId: 'legacy-imported' }),
		})
	})

	it('canonicalizes a legacy demo endpoint without dropping profile overrides', async () => {
		get.mockResolvedValue({
			llmConfig: {
				baseURL: LEGACY_TESTING_ENDPOINTS[0],
				model: 'old-model',
				apiKey: 'secret',
				temperature: 0.5,
			},
		})

		await expect(loadAgentConfig()).resolves.toEqual({
			baseURL: DEMO_BASE_URL,
			model: DEMO_MODEL,
			apiKey: 'secret',
			temperature: 0.5,
			language: undefined,
		})
		expect(set).toHaveBeenCalledWith({
			[LLM_PROFILE_STORE_KEY]: expect.objectContaining({ activeProfileId: 'legacy-imported' }),
		})
	})

	it('falls back to legacy config when the stored envelope is corrupted', async () => {
		get.mockResolvedValue({
			[LLM_PROFILE_STORE_KEY]: { version: 1, activeProfileId: 1, profiles: [] },
			llmConfig: { baseURL: 'https://api.siliconflow.cn/v1', model: 'Qwen/Qwen3' },
		})

		await expect(loadAgentConfig()).resolves.toMatchObject({
			baseURL: 'https://api.siliconflow.cn/v1',
			model: 'Qwen/Qwen3',
		})
	})

	it('repairs an invalid active profile id before considering legacy config', async () => {
		get.mockResolvedValue({
			[LLM_PROFILE_STORE_KEY]: {
				version: 1,
				activeProfileId: 'missing',
				profiles: [
					{
						id: 'available',
						name: 'Available',
						provider: 'custom',
						config: { baseURL: 'https://example.com', model: 'model' },
					},
				],
			},
			llmConfig: { baseURL: 'https://legacy.example.com', model: 'legacy' },
		})

		await expect(loadAgentConfig()).resolves.toMatchObject({ baseURL: 'https://example.com' })
		expect(set).toHaveBeenCalledWith({
			[LLM_PROFILE_STORE_KEY]: expect.objectContaining({ activeProfileId: 'available' }),
		})
	})

	it('returns the effective migrated config when store persistence fails', async () => {
		get.mockResolvedValue({ llmConfig: { baseURL: 'https://example.com', model: 'model' } })
		set.mockRejectedValue(new Error('storage unavailable'))

		await expect(loadAgentConfig()).resolves.toMatchObject({
			baseURL: 'https://example.com',
			model: 'model',
		})
		await Promise.resolve()
	})
})
