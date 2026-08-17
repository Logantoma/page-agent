import {
	LLM_PROFILE_STORE_KEY,
	type LlmProfileStoreV1,
	parseLlmProfileStore,
	resolveActiveProfile,
} from './LlmProfileStore'

export async function readPersistedProfileStore(): Promise<LlmProfileStoreV1 | null> {
	const result = await chrome.storage.local.get(LLM_PROFILE_STORE_KEY)
	const parsed = parseLlmProfileStore(result[LLM_PROFILE_STORE_KEY])
	return parsed ? resolveActiveProfile(parsed).store : null
}

export async function writeProfileStoreVerified(
	store: LlmProfileStoreV1
): Promise<LlmProfileStoreV1> {
	await chrome.storage.local.set({ [LLM_PROFILE_STORE_KEY]: store })
	const persisted = await readPersistedProfileStore()
	if (!persisted || !sameProfileStore(store, persisted)) {
		throw new Error('API 配置保存失败：本地存储未确认写入，请重试')
	}
	return persisted
}

function sameProfileStore(a: LlmProfileStoreV1, b: LlmProfileStoreV1): boolean {
	return JSON.stringify(a) === JSON.stringify(b)
}
