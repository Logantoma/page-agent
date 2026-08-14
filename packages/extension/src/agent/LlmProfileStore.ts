import type { LLMConfig } from '@page-agent/llms'

export const LLM_PROFILE_STORE_KEY = 'llmProfileStoreV1'

export type LlmProviderKind = 'siliconflow' | 'deepseek' | 'custom'

export interface SerializableLlmProfileConfig {
	baseURL: string
	model: string
	apiKey?: string
	temperature?: number
	maxRetries?: number
	disableNamedToolChoice?: boolean
}

export interface PersistedLlmProfile {
	id: string
	name: string
	provider: LlmProviderKind
	config: SerializableLlmProfileConfig
}

export interface LlmProfileStoreV1 {
	version: 1
	activeProfileId: string
	profiles: PersistedLlmProfile[]
}

export function serializeLlmProfileConfig(config: LLMConfig): SerializableLlmProfileConfig {
	return {
		baseURL: config.baseURL,
		model: config.model,
		...(config.apiKey === undefined ? {} : { apiKey: config.apiKey }),
		...(config.temperature === undefined ? {} : { temperature: config.temperature }),
		...(config.maxRetries === undefined ? {} : { maxRetries: config.maxRetries }),
		...(config.disableNamedToolChoice === undefined
			? {}
			: { disableNamedToolChoice: config.disableNamedToolChoice }),
	}
}

export function inferProviderKind(baseURL: string): LlmProviderKind {
	try {
		const hostname = new URL(baseURL).hostname.toLowerCase()
		if (hostname.endsWith('siliconflow.cn')) return 'siliconflow'
		if (hostname.endsWith('deepseek.com')) return 'deepseek'
	} catch {
		// A custom endpoint does not need to be a parseable URL to remain editable.
	}
	return 'custom'
}

export function createMigratedProfile(config: LLMConfig): PersistedLlmProfile {
	return {
		id: 'legacy-imported',
		name: 'Migrated API',
		provider: inferProviderKind(config.baseURL),
		config: serializeLlmProfileConfig(config),
	}
}

export function createProfileStore(profile: PersistedLlmProfile): LlmProfileStoreV1 {
	return { version: 1, activeProfileId: profile.id, profiles: [profile] }
}

export function parseLlmProfileStore(value: unknown): LlmProfileStoreV1 | null {
	if (!isRecord(value) || value.version !== 1 || typeof value.activeProfileId !== 'string')
		return null
	if (!Array.isArray(value.profiles)) return null

	const profiles = value.profiles.map(parseProfile)
	if (profiles.some((profile) => profile === null)) return null

	return {
		version: 1,
		activeProfileId: value.activeProfileId,
		profiles: profiles as PersistedLlmProfile[],
	}
}

export function resolveActiveProfile(store: LlmProfileStoreV1): {
	profile: PersistedLlmProfile | null
	store: LlmProfileStoreV1
	repaired: boolean
} {
	const profile = store.profiles.find(({ id }) => id === store.activeProfileId)
	if (profile) return { profile, store, repaired: false }

	const fallback = store.profiles[0]
	if (!fallback) return { profile: null, store, repaired: false }

	return {
		profile: fallback,
		store: { ...store, activeProfileId: fallback.id },
		repaired: true,
	}
}

export function updateActiveProfile(
	store: LlmProfileStoreV1,
	config: LLMConfig
): LlmProfileStoreV1 {
	const resolved = resolveActiveProfile(store)
	const activeProfile = resolved.profile
	if (!activeProfile) return store

	return {
		...resolved.store,
		profiles: resolved.store.profiles.map((profile) =>
			profile.id === activeProfile.id
				? { ...profile, config: serializeLlmProfileConfig(config) }
				: profile
		),
	}
}

function parseProfile(value: unknown): PersistedLlmProfile | null {
	if (!isRecord(value)) return null
	if (typeof value.id !== 'string' || !value.id || typeof value.name !== 'string') return null
	if (
		value.provider !== 'siliconflow' &&
		value.provider !== 'deepseek' &&
		value.provider !== 'custom'
	) {
		return null
	}
	const config = parseSerializableConfig(value.config)
	return config ? { id: value.id, name: value.name, provider: value.provider, config } : null
}

function parseSerializableConfig(value: unknown): SerializableLlmProfileConfig | null {
	if (!isRecord(value) || typeof value.baseURL !== 'string' || typeof value.model !== 'string')
		return null
	if (
		(value.apiKey !== undefined && typeof value.apiKey !== 'string') ||
		(value.temperature !== undefined && typeof value.temperature !== 'number') ||
		(value.maxRetries !== undefined && typeof value.maxRetries !== 'number') ||
		(value.disableNamedToolChoice !== undefined &&
			typeof value.disableNamedToolChoice !== 'boolean')
	) {
		return null
	}

	return {
		baseURL: value.baseURL,
		model: value.model,
		...(value.apiKey === undefined ? {} : { apiKey: value.apiKey }),
		...(value.temperature === undefined ? {} : { temperature: value.temperature }),
		...(value.maxRetries === undefined ? {} : { maxRetries: value.maxRetries }),
		...(value.disableNamedToolChoice === undefined
			? {}
			: { disableNamedToolChoice: value.disableNamedToolChoice }),
	}
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null
}
