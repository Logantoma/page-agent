import { useCallback, useEffect, useRef, useState } from 'react'

import { Switch } from '@/components/ui/switch'
import {
	isSiteUiEnabled,
	loadSiteUiPolicy,
	resolveSiteUiOrigin,
	saveSiteUiPolicy,
	setSiteUiEnabled,
	SITE_UI_POLICY_STORAGE_KEY,
	type SiteUiPolicyV1,
} from '@/lib/SiteUiPolicy'

interface SiteUiState {
	origin: string | null
	policy: SiteUiPolicyV1
}

export function SiteUiToggle() {
	const [site, setSite] = useState<SiteUiState | null>(null)
	const [pending, setPending] = useState(false)
	const requestId = useRef(0)

	const refresh = useCallback(async () => {
		const id = ++requestId.current
		const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
		const [policy] = await Promise.all([loadSiteUiPolicy()])
		if (id === requestId.current) setSite({ origin: resolveSiteUiOrigin(tab?.url ?? ''), policy })
	}, [])

	useEffect(() => {
		void refresh()
		const onActivated = () => void refresh()
		const onUpdated = (_tabId: number, changeInfo: chrome.tabs.OnUpdatedInfo) => {
			if (changeInfo.url) void refresh()
		}
		const onStorageChanged = (changes: Record<string, chrome.storage.StorageChange>, areaName: string) => {
			if (areaName === 'local' && SITE_UI_POLICY_STORAGE_KEY in changes) void refresh()
		}
		chrome.tabs.onActivated.addListener(onActivated)
		chrome.tabs.onUpdated.addListener(onUpdated)
		chrome.storage.onChanged.addListener(onStorageChanged)
		return () => {
			chrome.tabs.onActivated.removeListener(onActivated)
			chrome.tabs.onUpdated.removeListener(onUpdated)
			chrome.storage.onChanged.removeListener(onStorageChanged)
		}
	}, [refresh])

	const enabled = site?.origin ? isSiteUiEnabled(site.origin, site.policy) : false
	const toggle = async (nextEnabled: boolean) => {
		if (!site?.origin || pending) return
		setPending(true)
		try {
			const policy = setSiteUiEnabled(site.origin, nextEnabled, site.policy)
			await saveSiteUiPolicy(policy)
			setSite({ origin: site.origin, policy })
		} finally {
			setPending(false)
		}
	}

	return (
		<section className="border-b px-3 py-2.5">
			<div className="flex items-center justify-between gap-3">
				<div className="min-w-0">
					<p className="text-xs font-medium">当前网站</p>
					<p className="truncate text-[11px] text-muted-foreground">
						{site?.origin ?? '当前页面不支持注入式界面'}
					</p>
				</div>
				<Switch
					checked={enabled}
					onCheckedChange={(checked) => void toggle(checked)}
					disabled={!site?.origin || pending}
					aria-label="在当前网站显示 PsySquid Web"
				/>
			</div>
			{site?.origin && (
				<p className="mt-1 text-[11px] text-muted-foreground">
					关闭后将移除当前网站中的悬浮入口和工作面板。
				</p>
			)}
		</section>
	)
}
