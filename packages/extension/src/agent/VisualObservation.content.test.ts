// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'

import { hasSignificantVisualContent } from './VisualObservation.content'

afterEach(() => {
	document.body.replaceChildren()
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
