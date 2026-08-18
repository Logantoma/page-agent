// @vitest-environment happy-dom

import { beforeEach, describe, expect, it } from 'vitest'

import {
	isAgentOwnedScrollElement,
	scrollVerticallyWithPolicy,
	selectDefaultVerticalScrollTarget,
} from './ScrollPolicy.content'

const VIEWPORT_HEIGHT = 800
const VIEWPORT_WIDTH = 1200

describe('ScrollPolicy', () => {
	beforeEach(() => {
		document.body.innerHTML = ''
		Object.defineProperty(window, 'innerHeight', { configurable: true, value: VIEWPORT_HEIGHT })
		Object.defineProperty(window, 'innerWidth', { configurable: true, value: VIEWPORT_WIDTH })
		Object.defineProperty(document, 'scrollingElement', {
			configurable: true,
			value: document.documentElement,
		})
		setBox(document.documentElement, {
			clientHeight: VIEWPORT_HEIGHT,
			clientWidth: VIEWPORT_WIDTH,
			scrollHeight: VIEWPORT_HEIGHT,
			scrollTop: 0,
		})
		setBox(document.body, {
			clientHeight: VIEWPORT_HEIGHT,
			clientWidth: VIEWPORT_WIDTH,
			scrollHeight: VIEWPORT_HEIGHT,
			scrollTop: 0,
		})
	})

	it('always prefers the document when the page itself is scrollable', () => {
		setBox(document.documentElement, { scrollHeight: 2400, scrollTop: 0 })
		setBox(document.body, { scrollHeight: 2400 })
		const agentPanel = makeScrollable('agent-panel', 760, 3000, 1100)
		agentPanel.setAttribute('data-page-agent-ignore', 'true')

		const target = selectDefaultVerticalScrollTarget()
		expect(target).toEqual({ kind: 'page', element: document.documentElement })

		const message = scrollVerticallyWithPolicy(600)
		expect(document.documentElement.scrollTop).toBe(600)
		expect(agentPanel.scrollTop).toBe(0)
		expect(message).toContain('Scrolled page by 600px')
	})

	it('excludes Page Agent owned UI from app-container fallback', () => {
		const agentPanel = makeScrollable('agent-panel', 760, 3000, 1100)
		agentPanel.setAttribute('data-browser-use-ignore', 'true')
		const appMain = makeScrollable('app-main', 700, 2600, 1000)

		const target = selectDefaultVerticalScrollTarget()
		expect(target).toEqual({ kind: 'container', element: appMain })

		const message = scrollVerticallyWithPolicy(500)
		expect(appMain.scrollTop).toBe(500)
		expect(agentPanel.scrollTop).toBe(0)
		expect(message).toContain('Scrolled container (DIV#app-main) by 500px')
	})

	it('excludes descendants of Page Agent owned UI even without their own ignore attribute', () => {
		const wrapper = document.createElement('div')
		wrapper.setAttribute('data-page-agent-ignore', 'true')
		const nestedHistory = document.createElement('div')
		wrapper.appendChild(nestedHistory)
		document.body.appendChild(wrapper)
		setScrollableBox(nestedHistory, 700, 2400, 1000)

		expect(isAgentOwnedScrollElement(nestedHistory)).toBe(true)
		expect(selectDefaultVerticalScrollTarget()).toBeNull()
	})

	it('prefers an eligible active-element ancestor on non-scrollable app-shell pages', () => {
		const largeMain = makeScrollable('large-main', 760, 3000, 1100)
		const focusedPane = makeScrollable('focused-pane', 600, 1800, 700)
		const input = document.createElement('input')
		focusedPane.appendChild(input)
		input.focus()

		const target = selectDefaultVerticalScrollTarget()
		expect(target).toEqual({ kind: 'container', element: focusedPane })
		expect(target?.element).not.toBe(largeMain)
	})

	it('ignores offscreen fallback containers when a visible app container exists', () => {
		const offscreen = makeScrollable('offscreen', 760, 4000, 1150)
		offscreen.getBoundingClientRect = () => rect(0, 1200, 1150, 760)
		const visible = makeScrollable('visible', 650, 2200, 900)

		const target = selectDefaultVerticalScrollTarget()
		expect(target).toEqual({ kind: 'container', element: visible })
	})

	it('returns a stable warning when neither page nor eligible containers can scroll', () => {
		expect(selectDefaultVerticalScrollTarget()).toBeNull()
		expect(scrollVerticallyWithPolicy(400)).toBe(
			'⚠️ The page is not scrollable and no eligible page container was found.'
		)
	})
})

function makeScrollable(id: string, clientHeight: number, scrollHeight: number, width: number) {
	const element = document.createElement('div')
	element.id = id
	document.body.appendChild(element)
	setScrollableBox(element, clientHeight, scrollHeight, width)
	return element
}

function setScrollableBox(
	element: HTMLElement,
	clientHeight: number,
	scrollHeight: number,
	width: number
) {
	element.style.overflowY = 'auto'
	setBox(element, {
		clientHeight,
		clientWidth: width,
		scrollHeight,
		scrollTop: 0,
	})
	element.getBoundingClientRect = () => rect(0, 0, width, clientHeight)
}

function rect(left: number, top: number, width: number, height: number): DOMRect {
	return {
		x: left,
		y: top,
		top,
		left,
		right: left + width,
		bottom: top + height,
		width,
		height,
		toJSON: () => ({}),
	} as DOMRect
}

function setBox(
	element: HTMLElement,
	values: Partial<
		Record<'clientHeight' | 'clientWidth' | 'scrollHeight' | 'scrollTop', number>
	>
) {
	for (const [key, value] of Object.entries(values)) {
		Object.defineProperty(element, key, {
			configurable: true,
			writable: true,
			value,
		})
	}
}
