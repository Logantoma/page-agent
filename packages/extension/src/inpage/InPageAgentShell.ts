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
	#loadConfig: typeof loadAgentConfig
	#createAgent: AgentFactory
	#createPanel: PanelFactory
	#onAgentDispose = () => {
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
		if (this.#opened) this.#panel.show()
		else this.#panel.hide()
	}

	dispose(): void {
		if (this.#disposed) return
		this.#disposed = true
		this.#panel?.dispose()
		this.#agent?.removeEventListener('dispose', this.#onAgentDispose)
		this.#agent?.dispose()
		this.#panel = null
		this.#agent = null
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
			panel = this.#createPanel(agent, config)
			panel.show()
			if (this.#disposed) return

			this.#agent = agent
			this.#panel = panel
			this.#opened = true
			initialized = true
		} finally {
			if (!initialized) {
				panel?.dispose()
				agent?.removeEventListener('dispose', this.#onAgentDispose)
				agent?.dispose()
			}
		}
	}
}

function createAgent(config: ExtConfig): MultiPageAgent {
	const { systemInstruction, ...agentConfig } = config
	return new MultiPageAgent({
		...agentConfig,
		instructions: systemInstruction ? { system: systemInstruction } : undefined,
	})
}
