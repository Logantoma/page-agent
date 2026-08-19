import { Panel } from '@page-agent/ui'

import { MultiPageAgent } from '../agent/MultiPageAgent'
import type { ExtConfig } from '../agent/loadAgentConfig'
import { loadAgentConfig } from '../agent/loadAgentConfig'
import { InPageLauncher } from './InPageLauncher'

type AgentFactory = (config: ExtConfig) => MultiPageAgent
type PanelFactory = (agent: MultiPageAgent, config: ExtConfig) => Panel

export interface InPageAgentShellDependencies {
	loadConfig?: typeof loadAgentConfig
	createAgent?: AgentFactory
	createPanel?: PanelFactory
	createLauncher?: (options: ConstructorParameters<typeof InPageLauncher>[0]) => InPageLauncher
}

/** Owns the in-page Agent presentation lifecycle. */
export class InPageAgentShell {
	#launcher: InPageLauncher
	#agent: MultiPageAgent | null = null
	#panel: Panel | null = null
	#opened = false
	#disposed = false
	#initializing: Promise<void> | null = null
	#pendingConfigRecycle = false
	#loadConfig: typeof loadAgentConfig
	#createAgent: AgentFactory
	#createPanel: PanelFactory
	#onFullscreenChange = () => this.#syncMountTarget()
	#onStorageChanged = (changes: Record<string, chrome.storage.StorageChange>, areaName: string) => {
		if (areaName !== 'local' || !hasRelevantConfigChange(changes) || this.#disposed || !this.#agent)
			return
		if (this.#agent.status === 'running') {
			this.#pendingConfigRecycle = true
			return
		}
		this.#recycleAgent()
	}
	#onAgentStatusChange = () => {
		this.#launcher.setWorking(this.#agent?.status === 'running')
		if (this.#pendingConfigRecycle && this.#agent?.status !== 'running') this.#recycleAgent()
	}
	#onAgentDispose = () => {
		this.#pendingConfigRecycle = false
		this.#agent?.removeEventListener('statuschange', this.#onAgentStatusChange)
		this.#panel = null
		this.#agent = null
		this.#opened = false
	}

	constructor(dependencies: InPageAgentShellDependencies = {}) {
		this.#loadConfig = dependencies.loadConfig ?? loadAgentConfig
		this.#createAgent = dependencies.createAgent ?? createAgent
		this.#createPanel =
			dependencies.createPanel ??
			((agent, config) => new Panel(agent, { language: config.language }))
		const createLauncher = dependencies.createLauncher ?? ((options) => new InPageLauncher(options))
		this.#launcher = createLauncher({
			onClick: () => void this.toggle().catch((error) => console.error(error)),
		})
		document.addEventListener('fullscreenchange', this.#onFullscreenChange)
		globalThis.chrome?.storage?.onChanged?.addListener(this.#onStorageChanged)
		this.#syncMountTarget()
	}

	async toggle(): Promise<void> {
		if (this.#disposed) return
		if (this.#initializing) return this.#initializing

		if (!this.#agent || !this.#panel) {
			this.#initializing = this.#initialize()
			try {
				await this.#initializing
			} finally {
				this.#initializing = null
			}
			return
		}

		this.#opened = !this.#opened
		if (this.#opened) {
			this.#panel.show()
			this.#launcher.setActive(true)
		} else {
			this.#panel.hide()
			this.#launcher.setActive(false)
		}
	}

	dispose(): void {
		if (this.#disposed) return
		this.#disposed = true
		this.#recycleAgent()
		document.removeEventListener('fullscreenchange', this.#onFullscreenChange)
		globalThis.chrome?.storage?.onChanged?.removeListener(this.#onStorageChanged)
		this.#launcher.dispose()
	}

	async #initialize(): Promise<void> {
		const config = await this.#loadConfig()
		if (this.#disposed) return

		let agent: MultiPageAgent | null = null
		let panel: Panel | null = null
		let initialized = false

		try {
			agent = this.#createAgent(config)
			agent.addEventListener('dispose', this.#onAgentDispose)
			agent.addEventListener('statuschange', this.#onAgentStatusChange)
			panel = this.#createPanel(agent, config)
			panel.mount(this.#resolveMountTarget())
			panel.show()
			if (this.#disposed) return

			this.#agent = agent
			this.#panel = panel
			this.#opened = true
			this.#launcher.setActive(true)
			initialized = true
		} finally {
			if (!initialized) {
				panel?.dispose()
				agent?.removeEventListener('statuschange', this.#onAgentStatusChange)
				agent?.removeEventListener('dispose', this.#onAgentDispose)
				agent?.dispose()
			}
		}
	}

	#recycleAgent(): void {
		const panel = this.#panel
		const agent = this.#agent
		this.#pendingConfigRecycle = false
		this.#panel = null
		this.#agent = null
		this.#opened = false
		this.#launcher.setActive(false)
		this.#launcher.setWorking(false)
		agent?.removeEventListener('statuschange', this.#onAgentStatusChange)
		agent?.removeEventListener('dispose', this.#onAgentDispose)
		panel?.dispose()
		agent?.dispose()
	}

	#resolveMountTarget(): HTMLElement {
		return document.fullscreenElement instanceof HTMLElement
			? document.fullscreenElement
			: document.body
	}

	#syncMountTarget(): void {
		const target = this.#resolveMountTarget()
		this.#launcher.mount(target)
		this.#panel?.mount(target)
	}
}

function hasRelevantConfigChange(changes: Record<string, chrome.storage.StorageChange>): boolean {
	return ['llmProfileStoreV1', 'language', 'advancedConfig'].some((key) => key in changes)
}

function createAgent(config: ExtConfig): MultiPageAgent {
	const { systemInstruction, ...agentConfig } = config
	return new MultiPageAgent({
		...agentConfig,
		instructions: systemInstruction ? { system: systemInstruction } : undefined,
	})
}
