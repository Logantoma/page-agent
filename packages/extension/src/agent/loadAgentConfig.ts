import type { SupportedLanguage } from '@page-agent/core'
import type { LLMConfig } from '@page-agent/llms'

import {
	LLM_PROFILE_STORE_KEY,
	type LlmProfileStoreV1,
	createMigratedProfile,
	createProfileStore,
	parseLlmProfileStore,
	resolveActiveProfile,
} from './LlmProfileStore'

/** Language preference: undefined means follow system. */
export type LanguagePreference = SupportedLanguage | undefined

export interface AdvancedConfig {
	maxSteps?: number
	systemInstruction?: string
	experimentalLlmsTxt?: boolean
	experimentalIncludeAllTabs?: boolean
}

export interface ExtConfig extends LLMConfig, AdvancedConfig {
	language?: LanguagePreference
}

export class LlmProfileRequiredError extends Error {
	constructor() {
		super('Configure an LLM API profile before starting the agent.')
		this.name = 'LlmProfileRequiredError'
	}
}

function persistStoreBestEffort(store: LlmProfileStoreV1): void {
	void chrome.storage.local.set({ [LLM_PROFILE_STORE_KEY]: store }).catch((error) => {
		console.warn('[AgentConfig] Failed to persist LLM profile store', error)
	})
}

function getEffectiveLegacyConfig(
	legacyConfig: LLMConfig | undefined,
	advancedConfig: AdvancedConfig & { disableNamedToolChoice?: boolean }
): LLMConfig | null {
	if (
		!legacyConfig ||
		typeof legacyConfig.baseURL !== 'string' ||
		typeof legacyConfig.model !== 'string'
	) {
		return null
	}
	if (isRetiredDemoEndpoint(legacyConfig.baseURL)) return null

	return {
		...legacyConfig,
		disableNamedToolChoice:
			advancedConfig.disableNamedToolChoice ?? legacyConfig.disableNamedToolChoice,
	}
}

function isRetiredDemoEndpoint(baseURL: string): boolean {
	const normalized = baseURL.replace(/\/+$/, '')
	return (
		normalized === 'https://page-ag-testing-ohftxirgbn.cn-shanghai.fcapp.run' ||
		normalized === 'https://hwcxiuzfylggtcktqgij.supabase.co/functions/v1/llm-testing-proxy'
	)
}

/**
 * Load the active persisted profile and merge it with global Agent settings.
 * Legacy keys are read only as a one-time migration fallback.
 */
export async function loadAgentConfig(): Promise<ExtConfig> {
	const result = await chrome.storage.local.get([
		LLM_PROFILE_STORE_KEY,
		'llmConfig',
		'language',
		'advancedConfig',
	])
	const language = (result.language as SupportedLanguage) || undefined
	const storedAdvancedConfig =
		(result.advancedConfig as AdvancedConfig & {
			disableNamedToolChoice?: boolean
		}) ?? {}
	const { disableNamedToolChoice: legacyDisableNamedToolChoice, ...advancedConfig } =
		storedAdvancedConfig
	const legacyConfig = getEffectiveLegacyConfig(result.llmConfig as LLMConfig | undefined, {
		...advancedConfig,
		disableNamedToolChoice: legacyDisableNamedToolChoice,
	})
	const parsedStore = parseLlmProfileStore(result[LLM_PROFILE_STORE_KEY])

	if (parsedStore) {
		const resolved = resolveActiveProfile(parsedStore)
		if (resolved.repaired) persistStoreBestEffort(resolved.store)
		if (resolved.profile) return { ...resolved.profile.config, ...advancedConfig, language }
	}

	if (legacyConfig) {
		const store = createProfileStore(createMigratedProfile(legacyConfig))
		persistStoreBestEffort(store)
		return { ...store.profiles[0].config, ...advancedConfig, language }
	}

	throw new LlmProfileRequiredError()
}
