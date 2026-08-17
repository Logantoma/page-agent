import {
	BUILTIN_DEMO_PROFILE_ID,
	type LlmProfileStoreV1,
	type LlmProviderKind,
	type PersistedLlmProfile,
	type SerializableLlmProfileConfig,
} from './LlmProfileStore'

export interface UserProfileInput {
	name: string
	provider: LlmProviderKind
	config: SerializableLlmProfileConfig
}

export function createUserProfile(
	store: LlmProfileStoreV1,
	input: UserProfileInput
): { store: LlmProfileStoreV1; profile: PersistedLlmProfile } {
	const profile: PersistedLlmProfile = {
		id: createUniqueProfileId(store, createProfileIdBase(input)),
		name: normalizeProfileName(input.name),
		provider: input.provider,
		config: input.config,
	}
	return {
		profile,
		store: { ...store, profiles: [...store.profiles, profile] },
	}
}

export function updateUserProfile(
	store: LlmProfileStoreV1,
	profileId: string,
	input: UserProfileInput
): LlmProfileStoreV1 {
	assertMutableProfileId(profileId)
	if (!store.profiles.some((profile) => profile.id === profileId)) {
		throw new Error(`Unknown LLM profile: ${profileId}`)
	}
	return {
		...store,
		profiles: store.profiles.map((profile) =>
			profile.id === profileId
				? {
						...profile,
						name: normalizeProfileName(input.name),
						provider: input.provider,
						config: input.config,
					}
				: profile
		),
	}
}

export function deleteUserProfile(store: LlmProfileStoreV1, profileId: string): LlmProfileStoreV1 {
	assertMutableProfileId(profileId)
	if (!store.profiles.some((profile) => profile.id === profileId)) {
		throw new Error(`Unknown LLM profile: ${profileId}`)
	}
	return {
		...store,
		activeProfileId:
			store.activeProfileId === profileId ? BUILTIN_DEMO_PROFILE_ID : store.activeProfileId,
		profiles: store.profiles.filter((profile) => profile.id !== profileId),
	}
}

function normalizeProfileName(name: string): string {
	const normalized = name.trim()
	if (!normalized) throw new Error('Profile name is required')
	return normalized
}

function createProfileIdBase(input: UserProfileInput): string {
	const slug = input.name
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
	return slug || input.provider || 'profile'
}

function createUniqueProfileId(store: LlmProfileStoreV1, baseId: string): string {
	const reserved = new Set([BUILTIN_DEMO_PROFILE_ID, ...store.profiles.map(({ id }) => id)])
	if (!reserved.has(baseId)) return baseId

	let suffix = 2
	while (reserved.has(`${baseId}-${suffix}`)) suffix += 1
	return `${baseId}-${suffix}`
}

function assertMutableProfileId(profileId: string): void {
	if (profileId === BUILTIN_DEMO_PROFILE_ID) {
		throw new Error('The built-in demo profile cannot be modified')
	}
}
