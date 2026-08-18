import { PageController } from '@page-agent/page-controller'

import { withAgentUiHitTestIsolation } from './AgentUiHitTestIsolation.content'
import { withAgentUiScrollIsolation } from './AgentUiScrollIsolation.content'
import { withRedundantFormLabelIsolation } from './FormLabelIsolation.content'

type ScrollOptions = Parameters<PageController['scroll']>[0]

/**
 * Downstream extension adapter.
 *
 * Keep upstream PageController behavior intact and add only fork-specific guards
 * at this boundary so upstream package upgrades remain low-conflict.
 */
export class ExtensionPageController extends PageController {
	override async updateTree(): Promise<string> {
		return withAgentUiHitTestIsolation(() =>
			withRedundantFormLabelIsolation(() => super.updateTree())
		)
	}

	override async scroll(options: ScrollOptions) {
		// Explicit indexed scrolling is intentional and should retain upstream semantics.
		if (options.index !== undefined) return super.scroll(options)

		return withAgentUiScrollIsolation(() => super.scroll(options))
	}
}
