import type { SupportedLanguage } from '@page-agent/core'
import type { LLMConfig } from '@page-agent/llms'

import {
	LLM_PROFILE_STORE_KEY,
	type LlmProfileStoreV1,
	canonicalizeLegacyDemoConfig,
	createBuiltinDemoStore,
	createMigratedProfile,
	createProfileStore,
	isBareDemoConfig,
	parseLlmProfileStore,
	resolveActiveProfile,
	serializeLlmProfileConfig,
} from './LlmProfileStore'
import { DEMO_CONFIG } from './constants'

/** Language preference: undefined means follow system. */
export type LanguagePreference = SupportedLanguage | undefined

export interface AdvancedConfig {
	maxSteps?: number
	systemInstruction?: string
	experimentalLlmsTxt?: boolean
	experimentalIncludeAllTabs?: boolean
	experimentalVisualObservation?: boolean
}

export interface ExtConfig extends LLMConfig, AdvancedConfig {
	language?: LanguagePreference
}

function persistStoreBestEffort(store: LlmProfileStoreV1): void {
	void chrome.storage.local.set({ [LLM_PROFILE_STORE_KEY]: store }).catch((error) => {
		console.warn('[AgentConfig] Failed to persist LLM profile store', error)
	})
}

function createLegacyMigration(
	legacyConfig: LLMConfig,
	advancedConfig: AdvancedConfig & { disableNamedToolChoice?: boolean }
): LlmProfileStoreV1 {
	const canonicalConfig = canonicalizeLegacyDemoConfig(legacyConfig)
	const serializableConfig = serializeLlmProfileConfig({
		...canonicalConfig,
		disableNamedToolChoice:
			advancedConfig.disableNamedToolChoice ?? canonicalConfig.disableNamedToolChoice,
	})

	return isBareDemoConfig(serializableConfig)
		? createBuiltinDemoStore()
		: createProfileStore(createMigratedProfile(serializableConfig))
}

/**
 * Load the active profile as the existing flat Agent configuration contract.
 * Legacy keys are read only as a one-time migration fallback.
 */
export async function loadAgentConfig(): Promise<ExtConfig> {
	const result = await chrome.storage.local.get([
		LLM_PROFILE_STORE_KEY,
		'llmConfig',
		'language',
		'advancedConfig',
	])
	const language = (result.language as SupportedLanguage | null) || undefined
	const storedAdvancedConfig =
		(result.advancedConfig as AdvancedConfig & {
			disableNamedToolChoice?: boolean
		}) ?? {}
	const { disableNamedToolChoice, ...advancedConfig } = storedAdvancedConfig
	const parsedStore = parseLlmProfileStore(result[LLM_PROFILE_STORE_KEY])

	if (parsedStore) {
		const resolved = resolveActiveProfile(parsedStore)
		if (resolved.repaired) persistStoreBestEffort(resolved.store)
		return { ...resolved.config, ...advancedConfig, language }
	}

	const legacyConfig = (result.llmConfig as LLMConfig | undefined) ?? DEMO_CONFIG
	const store = createLegacyMigration(legacyConfig, { ...advancedConfig, disableNamedToolChoice })
	persistStoreBestEffort(store)

	return { ...resolveActiveProfile(store).config, ...advancedConfig, language }
}
