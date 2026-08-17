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
	_sender: chrome.runtime.MessageSender,
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

	if (!(await isActiveTarget(tab.windowId, tabId))) {
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

		// The user may switch tabs while the content script waits for paint frames.
		// Never capture a different active tab by accident.
		if (!(await isActiveTarget(tab.windowId, tabId))) {
			return { success: true, skipped: 'target_changed_before_capture' }
		}

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

async function isActiveTarget(windowId: number, tabId: number): Promise<boolean> {
	const [activeTab] = await chrome.tabs.query({ active: true, windowId })
	return activeTab?.id === tabId
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null
}
