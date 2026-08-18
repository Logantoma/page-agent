const NOT_INTERACTIVE_ATTR = 'data-page-agent-not-interactive'

interface SavedAttribute {
	element: HTMLLabelElement
	hadAttribute: boolean
	value: string | null
}

/**
 * Downstream compatibility guard for native form controls.
 *
 * Alibaba's DOM extractor intentionally treats <label> as interactive. In dense
 * forms this can produce a label index immediately before the real input/select,
 * which is easy for the LLM to misread as the control itself. When a label only
 * describes a visible native control, temporarily mark the label as non-interactive
 * and let upstream PageController continue indexing the actual control unchanged.
 */
export async function withRedundantFormLabelIsolation<T>(
	operation: () => Promise<T>,
	doc: Document = document
): Promise<T> {
	const saved = markRedundantFormLabels(doc)
	try {
		return await operation()
	} finally {
		restoreLabels(saved)
	}
}

export function collectRedundantFormLabels(doc: Document = document): HTMLLabelElement[] {
	return Array.from(doc.querySelectorAll<HTMLLabelElement>('label')).filter((label) => {
		const control = label.control
		if (!isSupportedNativeControl(control)) return false
		if (!isVisiblyActionable(control)) return false
		if (hasIndependentInteractionSemantics(label)) return false
		return true
	})
}

function isSupportedNativeControl(
	control: HTMLElement | null
): control is HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement {
	return (
		control instanceof HTMLInputElement ||
		control instanceof HTMLSelectElement ||
		control instanceof HTMLTextAreaElement
	)
}

function isVisiblyActionable(
	control: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
): boolean {
	if (control instanceof HTMLInputElement && control.type === 'hidden') return false
	if (control.hidden || control.hasAttribute('disabled')) return false

	const style = control.ownerDocument.defaultView?.getComputedStyle(control)
	if (style && (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse')) {
		return false
	}

	const rects = control.getClientRects()
	if (rects.length > 0) {
		return Array.from(rects).some((rect) => rect.width > 0 && rect.height > 0)
	}

	return control.offsetWidth > 0 || control.offsetHeight > 0
}

function hasIndependentInteractionSemantics(label: HTMLLabelElement): boolean {
	if (
		label.hasAttribute('onclick') ||
		typeof label.onclick === 'function' ||
		label.hasAttribute('role') ||
		label.hasAttribute('tabindex') ||
		label.hasAttribute('data-action') ||
		label.isContentEditable ||
		label.getAttribute('contenteditable') === 'true'
	) {
		return true
	}

	return /\b(btn|button|clickable|menu|item|entry|link)\b/i.test(label.className || '')
}

function markRedundantFormLabels(doc: Document): SavedAttribute[] {
	return collectRedundantFormLabels(doc).map((element) => {
		const hadAttribute = element.hasAttribute(NOT_INTERACTIVE_ATTR)
		const value = element.getAttribute(NOT_INTERACTIVE_ATTR)
		element.setAttribute(NOT_INTERACTIVE_ATTR, 'true')
		return { element, hadAttribute, value }
	})
}

function restoreLabels(saved: SavedAttribute[]): void {
	for (const { element, hadAttribute, value } of saved) {
		if (hadAttribute) element.setAttribute(NOT_INTERACTIVE_ATTR, value ?? '')
		else element.removeAttribute(NOT_INTERACTIVE_ATTR)
	}
}
