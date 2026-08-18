const AGENT_OWNED_SELECTOR =
	'[data-page-agent-ignore="true"], [data-browser-use-ignore="true"]'

interface SavedOverflowY {
	element: HTMLElement
	value: string
	priority: string
}

/**
 * Run an operation while Page Agent-owned UI is temporarily ineligible for
 * upstream scroll-container discovery.
 *
 * This is intentionally a downstream extension adapter. It does not reimplement
 * @page-agent/page-controller scrolling; it only prevents our own UI from being
 * selected by the upstream fallback heuristic.
 */
export async function withAgentUiScrollIsolation<T>(
	operation: () => Promise<T>,
	doc: Document = document
): Promise<T> {
	const saved = hideAgentOwnedScrollCandidates(doc)
	try {
		return await operation()
	} finally {
		restoreAgentOwnedScrollCandidates(saved)
	}
}

export function collectAgentOwnedScrollCandidates(doc: Document = document): HTMLElement[] {
	const candidates = new Set<HTMLElement>()

	for (const root of doc.querySelectorAll(AGENT_OWNED_SELECTOR)) {
		if (root instanceof HTMLElement) candidates.add(root)
		for (const descendant of root.querySelectorAll<HTMLElement>('*')) {
			candidates.add(descendant)
		}
	}

	return [...candidates]
}

function hideAgentOwnedScrollCandidates(doc: Document): SavedOverflowY[] {
	return collectAgentOwnedScrollCandidates(doc).map((element) => {
		const value = element.style.getPropertyValue('overflow-y')
		const priority = element.style.getPropertyPriority('overflow-y')
		element.style.setProperty('overflow-y', 'hidden', 'important')
		return { element, value, priority }
	})
}

function restoreAgentOwnedScrollCandidates(saved: SavedOverflowY[]): void {
	for (const { element, value, priority } of saved) {
		if (value) element.style.setProperty('overflow-y', value, priority)
		else element.style.removeProperty('overflow-y')
	}
}
