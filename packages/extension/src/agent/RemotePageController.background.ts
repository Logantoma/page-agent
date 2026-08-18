/**
 * background logics for RemotePageController
 * - redirect messages from RemotePageController(Agent, extension pages) to ContentScript
 */
import {
	listRegisteredPageFrames,
	registerPageFrame,
	removeRegisteredPageFrame,
} from './FrameRegistry.background'

interface PageControlMessage {
	type: 'PAGE_CONTROL'
	action: string
	payload?: any
	targetTabId?: number
	targetFrameId?: number
}

export function handlePageControlMessage(
	message: PageControlMessage,
	sender: chrome.runtime.MessageSender,
	sendResponse: (response: unknown) => void
): true | undefined {
	const PREFIX = '[RemotePageController.background]'
	const debug = console.debug.bind(console, `\x1b[90m${PREFIX}\x1b[0m`)

	const { action, payload, targetTabId, targetFrameId } = message

	if (action === 'get_my_tab_id') {
		debug('get_my_tab_id', sender.tab?.id, sender.frameId)
		sendResponse({ tabId: sender.tab?.id || null, frameId: sender.frameId ?? 0 })
		return
	}

	if (action === 'register_frame') {
		registerPageFrame(sender)
			.then((frame) => sendResponse({ success: frame !== null, frame }))
			.catch((error) =>
				sendResponse({ error: error instanceof Error ? error.message : String(error) })
			)
		return true
	}

	if (action === 'list_frames') {
		if (targetTabId == null) {
			sendResponse({ error: 'targetTabId is required for list_frames' })
			return
		}
		listRegisteredPageFrames(targetTabId)
			.then((frames) => sendResponse({ success: true, frames }))
			.catch((error) =>
				sendResponse({ error: error instanceof Error ? error.message : String(error) })
			)
		return true
	}

	if (action === 'unregister_frame') {
		if (targetTabId == null || targetFrameId == null) {
			sendResponse({ error: 'targetTabId and targetFrameId are required for unregister_frame' })
			return
		}
		removeRegisteredPageFrame(targetTabId, targetFrameId, payload?.documentId)
			.then(() => sendResponse({ success: true }))
			.catch((error) =>
				sendResponse({ error: error instanceof Error ? error.message : String(error) })
			)
		return true
	}

	if (targetTabId == null) {
		sendResponse({ error: 'targetTabId is required' })
		return
	}

	// Once content scripts run in all frames, an untargeted tabs.sendMessage would race
	// responses from multiple frames. Keep legacy calls deterministic by defaulting to frame 0.
	chrome.tabs
		.sendMessage(
			targetTabId,
			{
				type: 'PAGE_CONTROL',
				action,
				payload,
			},
			{ frameId: targetFrameId ?? 0 }
		)
		.then((result) => {
			sendResponse(result)
		})
		.catch((error) => {
			console.error(PREFIX, error)
			sendResponse({
				success: false,
				error: error instanceof Error ? error.message : String(error),
			})
		})

	return true
}
