import { beforeEach, describe, expect, it, vi } from 'vitest'

import { DEMO_CONFIG, LEGACY_TESTING_ENDPOINTS } from './constants'
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

	it('uses and persists the demo config when storage has no LLM config', async () => {
		get.mockResolvedValue({})

		await expect(loadAgentConfig()).resolves.toEqual({ ...DEMO_CONFIG, language: undefined })
		expect(set).toHaveBeenCalledWith({ llmConfig: DEMO_CONFIG })
	})

	it('migrates a legacy endpoint while preserving advanced settings and language', async () => {
		get.mockResolvedValue({
			llmConfig: { baseURL: LEGACY_TESTING_ENDPOINTS[0], model: 'old-model' },
			language: 'zh-CN',
			advancedConfig: { maxSteps: 7, systemInstruction: 'Use concise answers.' },
		})

		await expect(loadAgentConfig()).resolves.toEqual({
			...DEMO_CONFIG,
			language: 'zh-CN',
			maxSteps: 7,
			systemInstruction: 'Use concise answers.',
		})
		expect(set).toHaveBeenCalledWith({ llmConfig: DEMO_CONFIG })
	})

	it('returns effective config when persistence fails', async () => {
		get.mockResolvedValue({})
		set.mockRejectedValue(new Error('storage unavailable'))

		await expect(loadAgentConfig()).resolves.toEqual({ ...DEMO_CONFIG, language: undefined })
		await Promise.resolve()
	})
})
