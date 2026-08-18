import { PageController } from '@page-agent/page-controller'

import { withAgentUiScrollIsolation } from './AgentUiScrollIsolation.content'

type ScrollOptions = Parameters<PageController['scroll']>[0]

/**
 * Downstream extension adapter.
 *
 * Keep upstream PageController behavior intact and add only fork-specific guards
 * at this boundary so upstream package upgrades remain low-conflict.
 */
export class ExtensionPageController extends PageController {
	override async scroll(options: ScrollOptions) {
		// Explicit indexed scrolling is intentional and should retain upstream semantics.
		if (options.index !== undefined) return super.scroll(options)

		return withAgentUiScrollIsolation(() => super.scroll(options))
	}
}
