import { beforeEach, describe, expect, it, vi } from 'vitest'

import { LLM_PROFILE_STORE_KEY } from './LlmProfileStore'
import { loadAgentConfig } from './loadAgentConfig'

const get = vi.fn()
const set = vi.fn()

describe('visual observation config', () => {
	beforeEach(() => {
		get.mockReset()
		set.mockReset()
		set.mockResolvedValue(undefined)
		vi.stubGlobal('chrome', { storage: { local: { get, set } } })
	})

	it('loads experimentalVisualObservation from advancedConfig without moving it into the profile', async () => {
		get.mockResolvedValue({
			[LLM_PROFILE_STORE_KEY]: {
				version: 1,
				activeProfileId: 'vision',
				profiles: [
					{
						id: 'vision',
						name: 'Vision',
						provider: 'siliconflow',
						config: {
							baseURL: 'https://api.siliconflow.cn/v1',
							model: 'vision-model',
						},
					},
				],
			},
			advancedConfig: { experimentalVisualObservation: true },
		})

		await expect(loadAgentConfig()).resolves.toMatchObject({
			baseURL: 'https://api.siliconflow.cn/v1',
			model: 'vision-model',
			experimentalVisualObservation: true,
		})
	})
})
