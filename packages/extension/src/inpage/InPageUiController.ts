import {
	isSiteUiEnabled,
	loadSiteUiPolicy,
	resolveSiteUiOrigin,
	SITE_UI_POLICY_STORAGE_KEY,
} from '../lib/SiteUiPolicy'
import { InPageAgentShell } from './InPageAgentShell'

export interface InPageUiControllerDependencies {
	getUrl?: () => string
	loadPolicy?: typeof loadSiteUiPolicy
	createShell?: () => InPageAgentShell
}

/** Owns whether this document has an in-page UI shell. */
export class InPageUiController {
	#shell: InPageAgentShell | null = null
	#disposed = false
	#started = false
	#syncGeneration = 0
	#getUrl: () => string
	#loadPolicy: typeof loadSiteUiPolicy
	#createShell: () => InPageAgentShell
	#onStorageChanged = async (
		changes: Record<string, chrome.storage.StorageChange>,
		areaName: string
	): Promise<void> => {
		if (this.#disposed || areaName !== 'local' || !(SITE_UI_POLICY_STORAGE_KEY in changes)) return
		await this.sync()
	}

	constructor(dependencies: InPageUiControllerDependencies = {}) {
		this.#getUrl = dependencies.getUrl ?? (() => window.location.href)
		this.#loadPolicy = dependencies.loadPolicy ?? loadSiteUiPolicy
		this.#createShell = dependencies.createShell ?? (() => new InPageAgentShell())
	}

	async start(): Promise<void> {
		if (this.#disposed || this.#started) return
		this.#started = true
		chrome.storage.onChanged.addListener(this.#onStorageChanged)
		await this.sync()
	}

	async sync(): Promise<void> {
		if (this.#disposed) return
		const generation = ++this.#syncGeneration
		const origin = resolveSiteUiOrigin(this.#getUrl())
		const policy = await this.#loadPolicy()
		if (this.#disposed || generation !== this.#syncGeneration) return

		const enabled = origin !== null && isSiteUiEnabled(origin, policy)
		if (enabled && !this.#shell) this.#shell = this.#createShell()
		if (!enabled && this.#shell) {
			this.#shell.dispose()
			this.#shell = null
		}
	}

	dispose(): void {
		if (this.#disposed) return
		this.#disposed = true
		this.#syncGeneration++
		if (this.#started) chrome.storage.onChanged.removeListener(this.#onStorageChanged)
		this.#started = false
		this.#shell?.dispose()
		this.#shell = null
	}
}
