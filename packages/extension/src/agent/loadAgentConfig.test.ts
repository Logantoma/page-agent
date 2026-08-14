import { beforeEach, describe, expect, it, vi } from 'vitest'

import { LLM_PROFILE_STORE_KEY } from './LlmProfileStore'
import { LlmProfileRequiredError, loadAgentConfig } from './loadAgentConfig'

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
			[LLM_PROFILE_STORE_KEY]: {
				version: 1,
				activeProfileId: 'legacy-imported',
				profiles: [
					{
						id: 'legacy-imported',
						name: 'Migrated API',
						provider: 'deepseek',
						config: {
							baseURL: 'https://api.deepseek.com',
							model: 'deepseek-v4-flash',
							apiKey: 'secret',
							temperature: 0.4,
							maxRetries: 3,
						},
					},
				],
			},
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

	it('falls back to legacy config when the stored envelope is corrupted', async () => {
		get.mockResolvedValue({
			[LLM_PROFILE_STORE_KEY]: { version: 1, activeProfileId: 1, profiles: [] },
			llmConfig: { baseURL: 'https://api.siliconflow.cn/v1', model: 'Qwen/Qwen3' },
		})

		await expect(loadAgentConfig()).resolves.toMatchObject({
			baseURL: 'https://api.siliconflow.cn/v1',
			model: 'Qwen/Qwen3',
		})
		expect(set).toHaveBeenCalledTimes(1)
	})

	it('repairs an invalid active profile id without reading legacy config', async () => {
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

	it('requires a configured profile when neither profile store nor legacy config exists', async () => {
		get.mockResolvedValue({})

		await expect(loadAgentConfig()).rejects.toBeInstanceOf(LlmProfileRequiredError)
	})

	it('does not retain a retired demo endpoint as a user profile', async () => {
		get.mockResolvedValue({
			llmConfig: {
				baseURL: 'https://page-ag-testing-ohftxirgbn.cn-shanghai.fcapp.run',
				model: 'qwen3.5-plus',
			},
		})

		await expect(loadAgentConfig()).rejects.toBeInstanceOf(LlmProfileRequiredError)
		expect(set).not.toHaveBeenCalled()
	})
})
