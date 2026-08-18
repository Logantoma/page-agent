import { PageController } from '@page-agent/page-controller'

import { scrollVerticallyWithPolicy } from './ScrollPolicy.content'

type ScrollOptions = Parameters<PageController['scroll']>[0]

/**
 * Extension-owned adapter for downstream behavior overrides.
 *
 * Do not place PsySquid/Page-Agent fork-specific behavior into the upstream
 * @page-agent/page-controller package unless there is no viable adapter seam.
 */
export class ExtensionPageController extends PageController {
	#indexed = false

	override async updateTree(): Promise<string> {
		const result = await super.updateTree()
		this.#indexed = true
		return result
	}

	override async scroll(options: ScrollOptions) {
		// Indexed scrolling is explicitly targeted by the model. Preserve the upstream behavior.
		if (options.index !== undefined || !this.#indexed) return super.scroll(options)

		try {
			const { down, numPages, pixels } = options
			const amount = (pixels ?? numPages * window.innerHeight) * (down ? 1 : -1)
			return {
				success: true,
				message: scrollVerticallyWithPolicy(amount),
			}
		} catch (error) {
			return {
				success: false,
				message: `❌ Failed to scroll: ${error}`,
			}
		}
	}

	override dispose(): void {
		this.#indexed = false
		super.dispose()
	}
}
