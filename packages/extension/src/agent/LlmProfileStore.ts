import type { LLMConfig } from '@page-agent/llms'

import { DEMO_BASE_URL, DEMO_CONFIG, DEMO_MODEL, LEGACY_TESTING_ENDPOINTS } from './constants'

export const LLM_PROFILE_STORE_KEY = 'llmProfileStoreV1'
export const BUILTIN_DEMO_PROFILE_ID = 'builtin:demo'

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

export function createBuiltinDemoStore(): LlmProfileStoreV1 {
	return { version: 1, activeProfileId: BUILTIN_DEMO_PROFILE_ID, profiles: [] }
}

export function canonicalizeLegacyDemoConfig(config: LLMConfig): LLMConfig {
	const normalizedBaseURL = config.baseURL.replace(/\/+$/, '')
	if (!LEGACY_TESTING_ENDPOINTS.some((endpoint) => endpoint === normalizedBaseURL)) return config

	return { ...config, baseURL: DEMO_BASE_URL, model: DEMO_MODEL }
}

export function serializeLlmProfileConfig(config: LLMConfig): SerializableLlmProfileConfig {
	return {
		baseURL: config.baseURL,
		model: config.model,
		...(config.apiKey !== undefined ? { apiKey: config.apiKey } : {}),
		...(config.temperature !== undefined ? { temperature: config.temperature } : {}),
		...(config.maxRetries !== undefined ? { maxRetries: config.maxRetries } : {}),
		...(config.disableNamedToolChoice !== undefined
			? { disableNamedToolChoice: config.disableNamedToolChoice }
			: {}),
	}
}

export function isBareDemoConfig(config: SerializableLlmProfileConfig): boolean {
	return (
		config.baseURL.replace(/\/+$/, '') === DEMO_BASE_URL &&
		config.model === DEMO_MODEL &&
		config.apiKey === undefined &&
		config.temperature === undefined &&
		config.maxRetries === undefined &&
		config.disableNamedToolChoice === undefined
	)
}

export function createMigratedProfile(config: SerializableLlmProfileConfig): PersistedLlmProfile {
	return {
		id: 'legacy-imported',
		name: 'Migrated Page Agent Configuration',
		provider: inferProviderKind(config.baseURL),
		config,
	}
}

export function createProfileStore(profile: PersistedLlmProfile): LlmProfileStoreV1 {
	return { version: 1, activeProfileId: profile.id, profiles: [profile] }
}

export function updateActiveProfileConfig(
	store: LlmProfileStoreV1,
	config: SerializableLlmProfileConfig
): LlmProfileStoreV1 {
	const resolved = resolveActiveProfile(store)
	if (resolved.store.activeProfileId === BUILTIN_DEMO_PROFILE_ID) {
		if (isBareDemoConfig(config)) return resolved.store

		const id = createUniqueProfileId(resolved.store.profiles, 'default')
		return {
			...resolved.store,
			activeProfileId: id,
			profiles: [
				...resolved.store.profiles,
				{
					id,
					name: 'Default API',
					provider: inferProviderKind(config.baseURL),
					config,
				},
			],
		}
	}

	return {
		...resolved.store,
		profiles: resolved.store.profiles.map((profile) =>
			profile.id === resolved.store.activeProfileId
				? { ...profile, provider: inferProviderKind(config.baseURL), config }
				: profile
		),
	}
}

function createUniqueProfileId(profiles: PersistedLlmProfile[], baseId: string): string {
	const ids = new Set(profiles.map(({ id }) => id))
	if (!ids.has(baseId)) return baseId

	let suffix = 2
	while (ids.has(`${baseId}-${suffix}`)) suffix += 1
	return `${baseId}-${suffix}`
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
	config: SerializableLlmProfileConfig
	store: LlmProfileStoreV1
	repaired: boolean
} {
	if (store.activeProfileId === BUILTIN_DEMO_PROFILE_ID) {
		return { config: DEMO_CONFIG, store, repaired: false }
	}

	const profile = store.profiles.find(({ id }) => id === store.activeProfileId)
	if (profile) return { config: profile.config, store, repaired: false }

	const fallback = store.profiles[0]
	if (!fallback) {
		return {
			config: DEMO_CONFIG,
			store: createBuiltinDemoStore(),
			repaired: true,
		}
	}

	return {
		config: fallback.config,
		store: { ...store, activeProfileId: fallback.id },
		repaired: true,
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
		...(value.apiKey !== undefined ? { apiKey: value.apiKey } : {}),
		...(value.temperature !== undefined ? { temperature: value.temperature } : {}),
		...(value.maxRetries !== undefined ? { maxRetries: value.maxRetries } : {}),
		...(value.disableNamedToolChoice !== undefined
			? { disableNamedToolChoice: value.disableNamedToolChoice }
			: {}),
	}
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null
}
