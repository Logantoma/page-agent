export const SITE_UI_POLICY_STORAGE_KEY = 'siteUiPolicyV1'

export interface SiteUiPolicyV1 {
	version: 1
	disabledOrigins: string[]
}

export const DEFAULT_SITE_UI_POLICY: SiteUiPolicyV1 = {
	version: 1,
	disabledOrigins: [],
}

export function resolveSiteUiOrigin(url: string): string | null {
	try {
		const parsed = new URL(url)
		return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.origin : null
	} catch {
		return null
	}
}

export function isSiteUiEnabled(origin: string, policy: SiteUiPolicyV1): boolean {
	return !policy.disabledOrigins.includes(origin)
}

export function setSiteUiEnabled(
	origin: string,
	enabled: boolean,
	policy: SiteUiPolicyV1 = DEFAULT_SITE_UI_POLICY
): SiteUiPolicyV1 {
	const disabledOrigins = new Set(policy.disabledOrigins)
	if (enabled) disabledOrigins.delete(origin)
	else disabledOrigins.add(origin)

	return { version: 1, disabledOrigins: [...disabledOrigins] }
}

export async function loadSiteUiPolicy(): Promise<SiteUiPolicyV1> {
	const result = await chrome.storage.local.get(SITE_UI_POLICY_STORAGE_KEY)
	return parseSiteUiPolicy(result[SITE_UI_POLICY_STORAGE_KEY])
}

export async function saveSiteUiPolicy(policy: SiteUiPolicyV1): Promise<void> {
	await chrome.storage.local.set({ [SITE_UI_POLICY_STORAGE_KEY]: policy })
}

function parseSiteUiPolicy(value: unknown): SiteUiPolicyV1 {
	if (!value || typeof value !== 'object') return { ...DEFAULT_SITE_UI_POLICY }
	const policy = value as Partial<SiteUiPolicyV1>
	if (policy.version !== 1 || !Array.isArray(policy.disabledOrigins)) {
		return { ...DEFAULT_SITE_UI_POLICY }
	}

	return {
		version: 1,
		disabledOrigins: [...new Set(policy.disabledOrigins.filter((origin): origin is string => typeof origin === 'string'))],
	}
}
