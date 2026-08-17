const PREPARE_MESSAGE = 'VISUAL_OBSERVATION_PREPARE'
const RESTORE_MESSAGE = 'VISUAL_OBSERVATION_RESTORE'

interface HiddenStyle {
	element: HTMLElement
	opacity: string
	opacityPriority: string
	visibility: string
	visibilityPriority: string
	transition: string
	transitionPriority: string
}

let activeToken: string | null = null
let hiddenStyles: HiddenStyle[] = []

export function initVisualObservationContent(): () => void {
	const listener = (
		message: unknown,
		_sender: chrome.runtime.MessageSender,
		sendResponse: (response: unknown) => void
	): true | undefined => {
		if (!isRecord(message)) return
		if (message.type === PREPARE_MESSAGE) {
			prepareVisualObservation().then(sendResponse, (error) => {
				sendResponse({ shouldCapture: false, error: error instanceof Error ? error.message : String(error) })
			})
			return true
		}
		if (message.type === RESTORE_MESSAGE) {
			restoreVisualObservation(typeof message.token === 'string' ? message.token : null)
			sendResponse({ ok: true })
			return
		}
		return
	}

	chrome.runtime.onMessage.addListener(listener)
	return () => {
		restoreVisualObservation(null, true)
		chrome.runtime.onMessage.removeListener(listener)
	}
}

export function hasSignificantVisualContent(): boolean {
	for (const element of document.querySelectorAll('canvas, svg, img, video')) {
		if (isSignificantVisualElement(element)) return true
	}
	return false
}

async function prepareVisualObservation(): Promise<{ shouldCapture: boolean; token?: string }> {
	if (!hasSignificantVisualContent()) return { shouldCapture: false }

	restoreVisualObservation(null, true)
	const token = createToken()
	activeToken = token
	hiddenStyles = hideAgentOwnedUi()
	await nextAnimationFrame()
	await nextAnimationFrame()
	return { shouldCapture: true, token }
}

function restoreVisualObservation(token: string | null, force = false): void {
	if (!force && activeToken && token !== activeToken) return
	for (const style of hiddenStyles) {
		if (!style.element.isConnected) continue
		restoreStyleProperty(style.element, 'opacity', style.opacity, style.opacityPriority)
		restoreStyleProperty(
			style.element,
			'visibility',
			style.visibility,
			style.visibilityPriority
		)
		restoreStyleProperty(style.element, 'transition', style.transition, style.transitionPriority)
	}
	hiddenStyles = []
	activeToken = null
}

function hideAgentOwnedUi(): HiddenStyle[] {
	const selector = [
		'#page-agent-inpage-launcher',
		'#page-agent-runtime_agent-panel',
		'#page-agent-runtime_simulator-mask',
		'[data-page-agent-ignore="true"]',
	].join(',')
	const candidates = Array.from(document.querySelectorAll<HTMLElement>(selector))
	const roots = candidates.filter(
		(element) => !candidates.some((other) => other !== element && other.contains(element))
	)

	return roots.map((element) => {
		const opacity = element.style.getPropertyValue('opacity')
		const opacityPriority = element.style.getPropertyPriority('opacity')
		const visibility = element.style.getPropertyValue('visibility')
		const visibilityPriority = element.style.getPropertyPriority('visibility')
		const transition = element.style.getPropertyValue('transition')
		const transitionPriority = element.style.getPropertyPriority('transition')

		// Capture must never include a half-faded Page Agent overlay. Panel.css uses
		// `transition: all 0.3s`, so opacity-only hiding can still be visible after
		// two animation frames. Disable transitions and hard-hide synchronously.
		element.style.setProperty('transition', 'none', 'important')
		element.style.setProperty('opacity', '0', 'important')
		element.style.setProperty('visibility', 'hidden', 'important')

		return {
			element,
			opacity,
			opacityPriority,
			visibility,
			visibilityPriority,
			transition,
			transitionPriority,
		}
	})
}

function restoreStyleProperty(
	element: HTMLElement,
	property: string,
	value: string,
	priority: string
): void {
	if (value) element.style.setProperty(property, value, priority)
	else element.style.removeProperty(property)
}

function isSignificantVisualElement(element: Element): boolean {
	if (element.closest('[data-page-agent-ignore="true"], [data-browser-use-ignore="true"]')) return false
	const rect = element.getBoundingClientRect()
	if (!intersectsViewport(rect)) return false
	const style = getComputedStyle(element)
	const opacity = Number.parseFloat(style.opacity)
	if (
		style.display === 'none' ||
		style.visibility === 'hidden' ||
		(Number.isFinite(opacity) && opacity === 0)
	)
		return false

	const minWidth = element.tagName === 'CANVAS' ? 48 : 80
	const minHeight = element.tagName === 'CANVAS' ? 48 : 60
	return rect.width >= minWidth && rect.height >= minHeight && rect.width * rect.height >= 8_000
}

function intersectsViewport(rect: DOMRect): boolean {
	return rect.right > 0 && rect.bottom > 0 && rect.left < window.innerWidth && rect.top < window.innerHeight
}

function nextAnimationFrame(): Promise<void> {
	return new Promise((resolve) => requestAnimationFrame(() => resolve()))
}

function createToken(): string {
	return typeof crypto.randomUUID === 'function'
		? crypto.randomUUID()
		: `visual-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null
}
