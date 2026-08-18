export interface RegisteredPageFrame {
	tabId: number
	frameId: number
	documentId?: string
	url?: string
	origin?: string
	registeredAt: number
}

const STORAGE_PREFIX = 'pageAgentFrame:'

function storageKey(tabId: number, frameId: number): string {
	return `${STORAGE_PREFIX}${tabId}:${frameId}`
}

export async function registerPageFrame(
	sender: chrome.runtime.MessageSender
): Promise<RegisteredPageFrame | null> {
	const tabId = sender.tab?.id
	const frameId = sender.frameId
	if (tabId == null || frameId == null) return null

	const frame: RegisteredPageFrame = {
		tabId,
		frameId,
		documentId: sender.documentId,
		url: sender.url,
		origin: sender.origin,
		registeredAt: Date.now(),
	}

	await chrome.storage.session.set({ [storageKey(tabId, frameId)]: frame })
	return frame
}

export async function listRegisteredPageFrames(tabId: number): Promise<RegisteredPageFrame[]> {
	const all = await chrome.storage.session.get(null)
	const frames: RegisteredPageFrame[] = []

	for (const [key, value] of Object.entries(all)) {
		if (!key.startsWith(`${STORAGE_PREFIX}${tabId}:`)) continue
		if (!value || typeof value !== 'object') continue

		const frame = value as RegisteredPageFrame
		if (frame.tabId === tabId && Number.isInteger(frame.frameId)) frames.push(frame)
	}

	return frames.sort((a, b) => a.frameId - b.frameId)
}

export async function removeRegisteredPageFrame(
	tabId: number,
	frameId: number,
	documentId?: string
): Promise<void> {
	const key = storageKey(tabId, frameId)
	if (documentId) {
		const existing = (await chrome.storage.session.get(key))[key] as RegisteredPageFrame | undefined
		if (existing?.documentId && existing.documentId !== documentId) return
	}
	await chrome.storage.session.remove(key)
}
