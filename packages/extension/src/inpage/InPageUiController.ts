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
		if (this.#disposed) return
		chrome.storage.onChanged.addListener(this.#onStorageChanged)
		await this.sync()
	}

	async sync(): Promise<void> {
		if (this.#disposed) return
		const origin = resolveSiteUiOrigin(this.#getUrl())
		const enabled = origin !== null && isSiteUiEnabled(origin, await this.#loadPolicy())

		if (enabled && !this.#shell) this.#shell = this.#createShell()
		if (!enabled && this.#shell) {
			this.#shell.dispose()
			this.#shell = null
		}
	}

	dispose(): void {
		if (this.#disposed) return
		this.#disposed = true
		chrome.storage.onChanged.removeListener(this.#onStorageChanged)
		this.#shell?.dispose()
		this.#shell = null
	}
}
