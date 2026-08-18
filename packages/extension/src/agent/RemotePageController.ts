import type { BrowserState } from '@page-agent/page-controller'

import {
	rewriteFrameActionMessage,
	rewriteFrameContent,
	type FrameIndexRoute,
} from './FrameIndexNamespace'
import type { TabsController } from './TabsController'

const PREFIX = '[RemotePageController]'

const debug = console.debug.bind(console, `\x1b[90m${PREFIX}\x1b[0m`)

interface RegisteredPageFrame {
	tabId: number
	frameId: number
	documentId?: string
	url?: string
	origin?: string
	registeredAt: number
}

function sendMessage(message: {
	type: 'PAGE_CONTROL'
	action: string
	targetTabId: number
	targetFrameId?: number
	payload?: any
}): Promise<any> {
	return chrome.runtime.sendMessage(message).catch((error) => {
		console.error(PREFIX, message.action, error)
		return null
	})
}

function isBrowserState(value: unknown): value is BrowserState {
	if (!value || typeof value !== 'object') return false
	const state = value as Partial<BrowserState>
	return (
		typeof state.url === 'string' &&
		typeof state.title === 'string' &&
		typeof state.header === 'string' &&
		typeof state.content === 'string' &&
		typeof state.footer === 'string'
	)
}

/**
 * Agent side page controller.
 * - live in the agent env (extension page or content script)
 * - communicates with remote PageController via sw
 * - aggregates independently isolated frame controllers into one global index space
 */
export class RemotePageController {
	tabsController: TabsController
	private frameIndexRoutes = new Map<number, FrameIndexRoute>()
	private knownFrames: RegisteredPageFrame[] = []

	constructor(tabsController: TabsController) {
		this.tabsController = tabsController
	}

	get currentTabId(): number | null {
		return this.tabsController.currentTabId
	}

	private async getCurrentUrl(): Promise<string> {
		if (!this.currentTabId) return ''
		const { url } = await this.tabsController.getTabInfo(this.currentTabId)
		return url || ''
	}

	private async getCurrentTitle(): Promise<string> {
		if (!this.currentTabId) return ''
		const { title } = await this.tabsController.getTabInfo(this.currentTabId)
		return title || ''
	}

	async getLastUpdateTime(): Promise<number> {
		if (!this.currentTabId) throw new Error('tabsController not initialized.')
		return sendMessage({
			type: 'PAGE_CONTROL',
			action: 'get_last_update_time',
			targetTabId: this.currentTabId,
			targetFrameId: 0,
		})
	}

	async getBrowserState(): Promise<BrowserState> {
		let browserState: BrowserState
		debug('getBrowserState', this.currentTabId)

		const currentUrl = await this.getCurrentUrl()
		const currentTitle = await this.getCurrentTitle()

		if (!this.currentTabId || !isContentScriptAllowed(currentUrl)) {
			browserState = {
				url: currentUrl,
				title: currentTitle,
				header: '',
				content: '(empty page. either current page is not readable or not loaded yet.)',
				footer: '',
			}
			this.frameIndexRoutes.clear()
			this.knownFrames = []
		} else {
			browserState = await this.getAggregatedBrowserState(
				this.currentTabId,
				currentUrl,
				currentTitle
			)
		}

		const sum = await this.tabsController.summarizeTabs()
		browserState.header = sum + '\n\n' + (browserState.header || '')

		debug('getBrowserState: success', this.currentTabId, browserState)

		return browserState
	}

	async updateTree(): Promise<void> {
		if (!this.currentTabId || !isContentScriptAllowed(await this.getCurrentUrl())) return

		await sendMessage({
			type: 'PAGE_CONTROL',
			action: 'update_tree',
			targetTabId: this.currentTabId,
			targetFrameId: 0,
		})
	}

	async cleanUpHighlights(): Promise<void> {
		if (!this.currentTabId || !isContentScriptAllowed(await this.getCurrentUrl())) return

		const frames = this.knownFrames.length
			? this.knownFrames
			: await this.getRegisteredFrames(this.currentTabId, await this.getCurrentUrl())

		await Promise.allSettled(
			frames.map((frame) =>
				sendMessage({
					type: 'PAGE_CONTROL',
					action: 'clean_up_highlights',
					targetTabId: this.currentTabId!,
					targetFrameId: frame.frameId,
				})
			)
		)
	}

	async clickElement(index: number): Promise<DomActionReturn> {
		const route = this.resolveIndexRoute(index)
		const res = await this.remoteCallDomAction('click_element', [route.localIndex], route.frameId)
		// @note may cause page navigation, wait for 1 second to ensure the page loading started
		await new Promise((resolve) => setTimeout(resolve, 1000))
		return this.translateFrameActionReturn(res, route, index)
	}

	async inputText(index: number, text: string): Promise<DomActionReturn> {
		const route = this.resolveIndexRoute(index)
		const res = await this.remoteCallDomAction('input_text', [route.localIndex, text], route.frameId)
		return this.translateFrameActionReturn(res, route, index)
	}

	async selectOption(index: number, optionText: string): Promise<DomActionReturn> {
		const route = this.resolveIndexRoute(index)
		const res = await this.remoteCallDomAction(
			'select_option',
			[route.localIndex, optionText],
			route.frameId
		)
		return this.translateFrameActionReturn(res, route, index)
	}

	async scroll(options: {
		down: boolean
		numPages: number
		pixels?: number
		index?: number
	}): Promise<DomActionReturn> {
		let targetFrameId = 0
		let route: FrameIndexRoute | null = null
		let globalIndex: number | null = null
		const translated = { ...options }
		if (translated.index !== undefined) {
			globalIndex = translated.index
			route = this.resolveIndexRoute(translated.index)
			targetFrameId = route.frameId
			translated.index = route.localIndex
		}
		const res = await this.remoteCallDomAction('scroll', [translated], targetFrameId)
		return route && globalIndex !== null
			? this.translateFrameActionReturn(res, route, globalIndex)
			: res
	}

	async scrollHorizontally(options: {
		right: boolean
		pixels: number
		index?: number
	}): Promise<DomActionReturn> {
		let targetFrameId = 0
		let route: FrameIndexRoute | null = null
		let globalIndex: number | null = null
		const translated = { ...options }
		if (translated.index !== undefined) {
			globalIndex = translated.index
			route = this.resolveIndexRoute(translated.index)
			targetFrameId = route.frameId
			translated.index = route.localIndex
		}
		const res = await this.remoteCallDomAction('scroll_horizontally', [translated], targetFrameId)
		return route && globalIndex !== null
			? this.translateFrameActionReturn(res, route, globalIndex)
			: res
	}

	// `execute_javascript` is intentionally not implemented: AbortSignal cannot cross context

	/** @note Managed by content script via storage polling. */
	async showMask(): Promise<void> {}
	/** @note Managed by content script via storage polling. */
	async hideMask(): Promise<void> {}
	dispose(): void {
		this.frameIndexRoutes.clear()
		this.knownFrames = []
	}

	private resolveIndexRoute(index: number): FrameIndexRoute {
		return this.frameIndexRoutes.get(index) ?? { frameId: 0, localIndex: index }
	}

	private translateFrameActionReturn(
		result: DomActionReturn,
		route: FrameIndexRoute,
		globalIndex: number
	): DomActionReturn {
		if (route.frameId === 0 || typeof result?.message !== 'string') return result
		return {
			...result,
			message: rewriteFrameActionMessage(result.message, route, globalIndex),
		}
	}

	private async getAggregatedBrowserState(
		tabId: number,
		currentUrl: string,
		currentTitle: string
	): Promise<BrowserState> {
		const frames = await this.getRegisteredFrames(tabId, currentUrl)
		this.knownFrames = frames
		this.frameIndexRoutes.clear()

		let nextIndex = 0
		let topState: BrowserState | null = null
		const embeddedBlocks: string[] = []

		for (const frame of frames) {
			const state = await sendMessage({
				type: 'PAGE_CONTROL',
				action: 'get_browser_state',
				targetTabId: tabId,
				targetFrameId: frame.frameId,
			})

			if (!isBrowserState(state)) {
				if (frame.frameId !== 0) await this.removeStaleFrame(frame)
				continue
			}

			const rewritten = rewriteFrameContent(
				state.content,
				frame.frameId,
				nextIndex,
				this.frameIndexRoutes
			)
			nextIndex = rewritten.nextIndex

			if (frame.frameId === 0) {
				topState = { ...state, content: rewritten.content }
				continue
			}

			embeddedBlocks.push(
				[
					`--- Embedded frame ${frame.frameId}: [${state.title || 'untitled'}](${state.url || frame.url || ''}) ---`,
					rewritten.content || '(no interactive elements in this frame)',
					`--- End embedded frame ${frame.frameId} ---`,
				].join('\n')
			)
		}

		if (!topState) {
			topState = {
				url: currentUrl,
				title: currentTitle,
				header: '',
				content: '(top frame is not readable or not loaded yet.)',
				footer: '',
			}
		}

		if (embeddedBlocks.length) {
			topState.content = [
				topState.content,
				'',
				'Embedded frame contexts (interactive indices work like top-page indices):',
				...embeddedBlocks,
			].join('\n')
		}

		return topState
	}

	private async getRegisteredFrames(
		tabId: number,
		currentUrl: string
	): Promise<RegisteredPageFrame[]> {
		const response = await sendMessage({
			type: 'PAGE_CONTROL',
			action: 'list_frames',
			targetTabId: tabId,
		})

		const frames: RegisteredPageFrame[] = Array.isArray(response?.frames)
			? response.frames.filter(
					(frame: RegisteredPageFrame) => frame?.tabId === tabId && Number.isInteger(frame.frameId)
				)
			: []

		if (!frames.some((frame) => frame.frameId === 0)) {
			frames.push({ tabId, frameId: 0, url: currentUrl, registeredAt: Date.now() })
		}

		return frames.sort((a, b) => a.frameId - b.frameId)
	}

	private async removeStaleFrame(frame: RegisteredPageFrame): Promise<void> {
		if (!this.currentTabId) return
		await sendMessage({
			type: 'PAGE_CONTROL',
			action: 'unregister_frame',
			targetTabId: this.currentTabId,
			targetFrameId: frame.frameId,
			payload: { documentId: frame.documentId },
		})
	}

	private async remoteCallDomAction(
		action: string,
		payload: any[],
		targetFrameId = 0
	): Promise<DomActionReturn> {
		if (!this.currentTabId) {
			return { success: false, message: 'RemotePageController not initialized.' }
		}

		if (!isContentScriptAllowed(await this.getCurrentUrl())) {
			return {
				success: false,
				message:
					'Operation not allowed on this page. Use open_new_tab to navigate to a web page first.',
			}
		}

		return sendMessage({
			type: 'PAGE_CONTROL',
			action,
			targetTabId: this.currentTabId,
			targetFrameId,
			payload,
		})
	}
}

interface DomActionReturn {
	success: boolean
	message: string
}

/**
 * Check if a URL can run content scripts.
 */
export function isContentScriptAllowed(url: string | undefined): boolean {
	if (!url) return false

	const restrictedPatterns = [
		/^chrome:\/\//,
		/^chrome-extension:\/\//,
		/^about:/,
		/^edge:\/\//,
		/^brave:\/\//,
		/^opera:\/\//,
		/^vivaldi:\/\//,
		/^file:\/\//,
		/^view-source:/,
		/^devtools:\/\//,
	]

	return !restrictedPatterns.some((pattern) => pattern.test(url))
}
