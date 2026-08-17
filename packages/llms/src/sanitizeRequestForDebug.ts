const IMAGE_DATA_URL_PREFIX = /^data:image\/[a-z0-9.+-]+;base64,/i

/**
 * Build a debug-safe clone of an LLM request without retaining large inline images.
 * The network request still receives the original body unchanged.
 */
export function sanitizeRequestForDebug(value: unknown): unknown {
	if (typeof value === 'string') {
		return IMAGE_DATA_URL_PREFIX.test(value) ? '[inline image omitted]' : value
	}
	if (Array.isArray(value)) return value.map(sanitizeRequestForDebug)
	if (isPlainRecord(value)) {
		return Object.fromEntries(
			Object.entries(value).map(([key, child]) => [key, sanitizeRequestForDebug(child)])
		)
	}
	return value
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
	if (typeof value !== 'object' || value === null) return false
	const prototype = Object.getPrototypeOf(value)
	return prototype === Object.prototype || prototype === null
}
