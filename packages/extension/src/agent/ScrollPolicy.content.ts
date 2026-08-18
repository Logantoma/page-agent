const AGENT_OWNED_SELECTOR =
	'[data-page-agent-ignore="true"], [data-browser-use-ignore="true"]'

export type DefaultVerticalScrollTarget =
	| { kind: 'page'; element: HTMLElement }
	| { kind: 'container'; element: HTMLElement }

/**
 * Downstream extension scroll policy.
 *
 * Keep this outside @page-agent/page-controller so upstream package upgrades remain clean.
 * Default scrolling is page-first; app-style container fallback is only used when the
 * document itself cannot scroll. Page Agent owned UI is never eligible as a fallback.
 */
export function selectDefaultVerticalScrollTarget(
	doc: Document = document,
	viewportHeight: number = window.innerHeight
): DefaultVerticalScrollTarget | null {
	const pageElement = getPageScrollElement(doc)
	if (isDocumentScrollable(doc, viewportHeight)) {
		return { kind: 'page', element: pageElement }
	}

	const activeContainer = findEligibleAncestor(doc.activeElement, viewportHeight)
	if (activeContainer) return { kind: 'container', element: activeContainer }

	const fallback = findLargestEligibleContainer(doc, viewportHeight)
	return fallback ? { kind: 'container', element: fallback } : null
}

export function scrollVerticallyWithPolicy(
	scrollAmount: number,
	doc: Document = document,
	viewportHeight: number = window.innerHeight
): string {
	const target = selectDefaultVerticalScrollTarget(doc, viewportHeight)
	if (!target) {
		return '⚠️ The page is not scrollable and no eligible page container was found.'
	}

	if (target.kind === 'page') {
		const maxScroll = getDocumentMaxScroll(doc, viewportHeight)
		const before = target.element.scrollTop
		const after = clamp(before + scrollAmount, 0, maxScroll)
		target.element.scrollTop = after
		const scrolled = target.element.scrollTop - before

		if (Math.abs(scrolled) < 1) {
			return scrollAmount > 0
				? '⚠️ Already at the bottom of the page, cannot scroll down further.'
				: '⚠️ Already at the top of the page, cannot scroll up further.'
		}

		if (scrollAmount > 0 && target.element.scrollTop >= maxScroll - 1) {
			return `✅ Scrolled page by ${scrolled}px. Reached the bottom of the page.`
		}
		if (scrollAmount < 0 && target.element.scrollTop <= 1) {
			return `✅ Scrolled page by ${scrolled}px. Reached the top of the page.`
		}
		return `✅ Scrolled page by ${scrolled}px.`
	}

	const before = target.element.scrollTop
	const maxScroll = Math.max(0, target.element.scrollHeight - target.element.clientHeight)
	const after = clamp(before + scrollAmount, 0, maxScroll)
	target.element.scrollTop = after
	const scrolled = target.element.scrollTop - before
	const label = describeContainer(target.element)

	if (Math.abs(scrolled) < 1) {
		return scrollAmount > 0
			? `⚠️ The document is not scrollable. Container (${label}) is already at the bottom.`
			: `⚠️ The document is not scrollable. Container (${label}) is already at the top.`
	}

	if (scrollAmount > 0 && target.element.scrollTop >= maxScroll - 1) {
		return `✅ The document is not scrollable. Scrolled container (${label}) by ${scrolled}px. Reached the bottom.`
	}
	if (scrollAmount < 0 && target.element.scrollTop <= 1) {
		return `✅ The document is not scrollable. Scrolled container (${label}) by ${scrolled}px. Reached the top.`
	}
	return `✅ The document is not scrollable. Scrolled container (${label}) by ${scrolled}px.`
}

export function isAgentOwnedScrollElement(element: Element): boolean {
	return Boolean(element.closest(AGENT_OWNED_SELECTOR))
}

function getPageScrollElement(doc: Document): HTMLElement {
	const scrollingElement = doc.scrollingElement
	return scrollingElement instanceof HTMLElement ? scrollingElement : doc.documentElement
}

function getDocumentHeight(doc: Document): number {
	return Math.max(
		getPageScrollElement(doc).scrollHeight,
		doc.documentElement.scrollHeight,
		doc.body?.scrollHeight ?? 0
	)
}

function getDocumentMaxScroll(doc: Document, viewportHeight: number): number {
	return Math.max(0, getDocumentHeight(doc) - viewportHeight)
}

function isDocumentScrollable(doc: Document, viewportHeight: number): boolean {
	return getDocumentMaxScroll(doc, viewportHeight) > 1
}

function findEligibleAncestor(start: Element | null, viewportHeight: number): HTMLElement | null {
	let current = start instanceof HTMLElement ? start : null
	while (current && current !== current.ownerDocument.body) {
		if (isEligibleContainer(current, viewportHeight)) return current
		current = current.parentElement
	}
	return null
}

function findLargestEligibleContainer(doc: Document, viewportHeight: number): HTMLElement | null {
	let best: HTMLElement | null = null
	let bestScore = -1

	for (const element of doc.querySelectorAll<HTMLElement>('*')) {
		if (!isEligibleContainer(element, viewportHeight)) continue
		const score = visibleArea(element)
		if (score > bestScore) {
			best = element
			bestScore = score
		}
	}
	return best
}

function isEligibleContainer(element: HTMLElement, viewportHeight: number): boolean {
	if (isAgentOwnedScrollElement(element)) return false
	if (element === element.ownerDocument.body || element === element.ownerDocument.documentElement) {
		return false
	}

	const win = element.ownerDocument.defaultView
	if (!win) return false
	const style = win.getComputedStyle(element)
	if (!/(auto|scroll|overlay)/.test(style.overflowY)) return false
	if (element.scrollHeight <= element.clientHeight + 1) return false
	if (element.clientHeight < viewportHeight * 0.5) return false
	if (style.display === 'none' || style.visibility === 'hidden') return false
	const opacity = Number.parseFloat(style.opacity)
	if (Number.isFinite(opacity) && opacity === 0) return false
	return true
}

function visibleArea(element: HTMLElement): number {
	const rect = element.getBoundingClientRect()
	const win = element.ownerDocument.defaultView
	if (!win) return element.clientWidth * element.clientHeight

	const width = Math.max(0, Math.min(rect.right, win.innerWidth) - Math.max(rect.left, 0))
	const height = Math.max(0, Math.min(rect.bottom, win.innerHeight) - Math.max(rect.top, 0))
	const area = width * height
	return area > 0 ? area : element.clientWidth * element.clientHeight
}

function describeContainer(element: HTMLElement): string {
	if (element.id) return `${element.tagName}#${element.id}`
	return element.tagName
}

function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value))
}
