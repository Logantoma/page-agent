const AGENT_OWNED_SELECTOR =
	'[data-page-agent-ignore="true"], [data-browser-use-ignore="true"]'

interface SavedPointerEvents {
	element: HTMLElement
	value: string
	priority: string
}

/**
 * Run DOM extraction while extension-owned UI cannot occlude page elements in
 * document.elementFromPoint() hit testing used by upstream PageController.
 *
 * This deliberately does not replace or modify the upstream DOM extraction
 * algorithm. It only removes our own UI from hit testing for the duration of
 * the upstream operation, then restores exact inline styles.
 */
export async function withAgentUiHitTestIsolation<T>(
	operation: () => Promise<T>,
	doc: Document = document
): Promise<T> {
	const saved = disableAgentOwnedHitTesting(doc)
	try {
		return await operation()
	} finally {
		restoreAgentOwnedHitTesting(saved)
	}
}

export function collectAgentOwnedHitTestElements(doc: Document = document): HTMLElement[] {
	const elements = new Set<HTMLElement>()

	for (const root of doc.querySelectorAll(AGENT_OWNED_SELECTOR)) {
		if (root instanceof HTMLElement) elements.add(root)
		for (const descendant of root.querySelectorAll<HTMLElement>('*')) {
			elements.add(descendant)
		}
	}

	return [...elements]
}

function disableAgentOwnedHitTesting(doc: Document): SavedPointerEvents[] {
	return collectAgentOwnedHitTestElements(doc).map((element) => {
		const value = element.style.getPropertyValue('pointer-events')
		const priority = element.style.getPropertyPriority('pointer-events')
		element.style.setProperty('pointer-events', 'none', 'important')
		return { element, value, priority }
	})
}

function restoreAgentOwnedHitTesting(saved: SavedPointerEvents[]): void {
	for (const { element, value, priority } of saved) {
		if (value) element.style.setProperty('pointer-events', value, priority)
		else element.style.removeProperty('pointer-events')
	}
}
