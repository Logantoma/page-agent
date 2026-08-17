// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { hasSignificantVisualContent, initVisualObservationContent } from './VisualObservation.content'

let runtimeListener:
	| ((
			message: unknown,
			sender: chrome.runtime.MessageSender,
			sendResponse: (response: unknown) => void
	  ) => true | undefined)
	| null = null

beforeEach(() => {
	runtimeListener = null
	vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
		callback(0)
		return 1
	})
	vi.stubGlobal('chrome', {
		runtime: {
			onMessage: {
				addListener: vi.fn((listener) => {
					runtimeListener = listener
				}),
				removeListener: vi.fn(),
			},
		},
	})
})

afterEach(() => {
	document.body.replaceChildren()
	vi.unstubAllGlobals()
})

describe('hasSignificantVisualContent', () => {
	it('detects a large visible canvas', () => {
		const canvas = document.createElement('canvas')
		canvas.getBoundingClientRect = () => rect(20, 20, 320, 220)
		document.body.append(canvas)

		expect(hasSignificantVisualContent()).toBe(true)
	})

	it('ignores tiny decorative SVG elements', () => {
		const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
		svg.getBoundingClientRect = () => rect(20, 20, 24, 24)
		document.body.append(svg)

		expect(hasSignificantVisualContent()).toBe(false)
	})

	it('ignores Page Agent owned visual elements', () => {
		const wrapper = document.createElement('div')
		wrapper.setAttribute('data-page-agent-ignore', 'true')
		const canvas = document.createElement('canvas')
		canvas.getBoundingClientRect = () => rect(20, 20, 320, 220)
		wrapper.append(canvas)
		document.body.append(wrapper)

		expect(hasSignificantVisualContent()).toBe(false)
	})
})

describe('visual capture preparation', () => {
	it('hard-hides agent UI without transitions and restores exact inline styles', async () => {
		const canvas = document.createElement('canvas')
		canvas.getBoundingClientRect = () => rect(20, 20, 320, 220)
		document.body.append(canvas)

		const panel = document.createElement('div')
		panel.id = 'page-agent-runtime_agent-panel'
		panel.setAttribute('data-page-agent-ignore', 'true')
		panel.style.setProperty('opacity', '1')
		panel.style.setProperty('visibility', 'visible')
		panel.style.setProperty('transition', 'all 0.3s ease-in-out')
		document.body.append(panel)

		const dispose = initVisualObservationContent()
		expect(runtimeListener).not.toBeNull()

		let prepareResponse: any
		const pending = runtimeListener!(
			{ type: 'VISUAL_OBSERVATION_PREPARE' },
			{} as chrome.runtime.MessageSender,
			(response) => {
				prepareResponse = response
			}
		)
		expect(pending).toBe(true)
		await vi.waitFor(() => expect(prepareResponse?.shouldCapture).toBe(true))

		expect(panel.style.getPropertyValue('transition')).toBe('none')
		expect(panel.style.getPropertyPriority('transition')).toBe('important')
		expect(panel.style.getPropertyValue('opacity')).toBe('0')
		expect(panel.style.getPropertyPriority('opacity')).toBe('important')
		expect(panel.style.getPropertyValue('visibility')).toBe('hidden')
		expect(panel.style.getPropertyPriority('visibility')).toBe('important')

		runtimeListener!(
			{ type: 'VISUAL_OBSERVATION_RESTORE', token: prepareResponse.token },
			{} as chrome.runtime.MessageSender,
			() => undefined
		)

		expect(panel.style.getPropertyValue('transition')).toBe('all 0.3s ease-in-out')
		expect(panel.style.getPropertyValue('opacity')).toBe('1')
		expect(panel.style.getPropertyValue('visibility')).toBe('visible')

		dispose()
	})
})

function rect(x: number, y: number, width: number, height: number): DOMRect {
	return {
		x,
		y,
		width,
		height,
		top: y,
		right: x + width,
		bottom: y + height,
		left: x,
		toJSON: () => ({}),
	} as DOMRect
}
