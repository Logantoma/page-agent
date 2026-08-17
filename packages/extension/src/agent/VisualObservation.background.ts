const CAPTURE_MESSAGE = 'VISUAL_OBSERVATION_CAPTURE'
const PREPARE_MESSAGE = 'VISUAL_OBSERVATION_PREPARE'
const RESTORE_MESSAGE = 'VISUAL_OBSERVATION_RESTORE'

interface PrepareResponse {
	shouldCapture?: boolean
	token?: string
	error?: string
}

export function handleVisualObservationMessage(
	message: unknown,
	_sendResponseSender: chrome.runtime.MessageSender,
	sendResponse: (response: unknown) => void
): true | undefined {
	if (!isRecord(message) || message.type !== CAPTURE_MESSAGE || typeof message.tabId !== 'number') {
		return
	}

	captureActiveTab(message.tabId).then(sendResponse, (error) => {
		sendResponse({ success: false, error: error instanceof Error ? error.message : String(error) })
	})
	return true
}

async function captureActiveTab(tabId: number): Promise<Record<string, unknown>> {
	const tab = await chrome.tabs.get(tabId)
	if (tab.windowId == null) return { success: true, skipped: 'missing_window' }

	const [activeTab] = await chrome.tabs.query({ active: true, windowId: tab.windowId })
	if (!activeTab || activeTab.id !== tabId) {
		return { success: true, skipped: 'target_not_active' }
	}

	let token: string | undefined
	try {
		let prepared: PrepareResponse
		try {
			prepared = (await chrome.tabs.sendMessage(tabId, { type: PREPARE_MESSAGE })) as PrepareResponse
		} catch {
			return { success: true, skipped: 'content_script_unavailable' }
		}

		if (!prepared?.shouldCapture) {
			return { success: true, skipped: prepared?.error ? 'prepare_failed' : 'no_visual_content' }
		}
		token = prepared.token

		const imageUrl = await chrome.tabs.captureVisibleTab(tab.windowId, {
			format: 'jpeg',
			quality: 70,
		})
		return { success: true, imageUrl }
	} finally {
		if (token) {
			await chrome.tabs
				.sendMessage(tabId, { type: RESTORE_MESSAGE, token })
				.catch(() => undefined)
		}
	}
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null
}
