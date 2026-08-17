const MIN_CAPTURE_INTERVAL_MS = 600

interface CaptureResponse {
	success?: boolean
	imageUrl?: string
	skipped?: string
	error?: string
}

export function createVisualObservationProvider(
	getCurrentTabId: () => number | null,
	now: () => number = Date.now
): () => Promise<string | null> {
	let lastAttemptAt = -Infinity

	return async () => {
		const tabId = getCurrentTabId()
		if (tabId == null) return null

		const currentTime = now()
		if (currentTime - lastAttemptAt < MIN_CAPTURE_INTERVAL_MS) return null
		lastAttemptAt = currentTime

		try {
			const response = (await chrome.runtime.sendMessage({
				type: 'VISUAL_OBSERVATION_CAPTURE',
				tabId,
			})) as CaptureResponse
			if (!response?.success || typeof response.imageUrl !== 'string') return null
			return response.imageUrl
		} catch (error) {
			console.warn('[VisualObservation] Capture failed', error)
			return null
		}
	}
}
