import type { SupportedLanguage } from '@page-agent/core'
import type { LLMConfig } from '@page-agent/llms'

import { DEMO_CONFIG, migrateLegacyEndpoint } from '../agent/constants'

/** Language preference: undefined means follow system. */
export type LanguagePreference = SupportedLanguage | undefined

export interface AdvancedConfig {
	maxSteps?: number
	systemInstruction?: string
	experimentalLlmsTxt?: boolean
	experimentalIncludeAllTabs?: boolean
	disableNamedToolChoice?: boolean
}

export interface ExtConfig extends LLMConfig, AdvancedConfig {
	language?: LanguagePreference
}

/**
 * Load the extension Agent configuration and preserve the Side Panel's
 * existing defaulting and legacy-endpoint migration behavior.
 */
export async function loadAgentConfig(): Promise<ExtConfig> {
	const result = await chrome.storage.local.get(['llmConfig', 'language', 'advancedConfig'])
	let llmConfig = (result.llmConfig as LLMConfig) ?? DEMO_CONFIG
	const language = (result.language as SupportedLanguage) || undefined
	const advancedConfig = (result.advancedConfig as AdvancedConfig) ?? {}

	const migrated = migrateLegacyEndpoint(llmConfig)
	if (migrated !== llmConfig) {
		llmConfig = migrated
		await chrome.storage.local.set({ llmConfig: migrated })
	} else if (!result.llmConfig) {
		await chrome.storage.local.set({ llmConfig: DEMO_CONFIG })
	}

	return { ...llmConfig, ...advancedConfig, language }
}
