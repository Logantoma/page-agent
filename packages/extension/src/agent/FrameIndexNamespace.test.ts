import { describe, expect, it } from 'vitest'

import {
	rewriteFrameActionMessage,
	rewriteFrameContent,
	type FrameIndexRoute,
} from './FrameIndexNamespace'

describe('rewriteFrameContent', () => {
	it('assigns one global index space across independent frame-local indices', () => {
		const routes = new Map<number, FrameIndexRoute>()

		const top = rewriteFrameContent(
			'[0]<input id=top />\n\t*[1]<button>Top action />',
			0,
			0,
			routes
		)
		const child = rewriteFrameContent(
			'[0]<button id=frameAction>Frame action />\n[1]<input id=frameInput />',
			7,
			top.nextIndex,
			routes
		)

		expect(top.content).toContain('[0]<input')
		expect(top.content).toContain('*[1]<button')
		expect(child.content).toContain('[2]<button')
		expect(child.content).toContain('[3]<input')
		expect(routes.get(0)).toEqual({ frameId: 0, localIndex: 0 })
		expect(routes.get(1)).toEqual({ frameId: 0, localIndex: 1 })
		expect(routes.get(2)).toEqual({ frameId: 7, localIndex: 0 })
		expect(routes.get(3)).toEqual({ frameId: 7, localIndex: 1 })
	})

	it('does not rewrite bracketed numbers in ordinary page text', () => {
		const routes = new Map<number, FrameIndexRoute>()
		const result = rewriteFrameContent(
			'Invoice [2026] remains text\n[0]<button>Continue />',
			4,
			10,
			routes
		)

		expect(result.content).toContain('Invoice [2026] remains text')
		expect(result.content).toContain('[10]<button')
		expect(routes.get(10)).toEqual({ frameId: 4, localIndex: 0 })
	})
})

describe('rewriteFrameActionMessage', () => {
	it('rewrites child-frame local action indices back to global indices', () => {
		const route = { frameId: 437, localIndex: 0 }

		expect(rewriteFrameActionMessage('Clicked element (0).', route, 2)).toBe(
			'Clicked element (2). [frame 437]'
		)
		expect(
			rewriteFrameActionMessage(
				'Clicked element ([0]<button type=button id=reveal>Show />).',
				route,
				2
			)
		).toBe('Clicked element ([2]<button type=button id=reveal>Show />). [frame 437]')
		expect(rewriteFrameActionMessage('No interactive element with index 0.', route, 2)).toBe(
			'No interactive element with index 2. [frame 437]'
		)
	})

	it('leaves top-frame action feedback unchanged', () => {
		expect(
			rewriteFrameActionMessage('Clicked element ([0]<button>Submit />).', {
				frameId: 0,
				localIndex: 0,
			}, 0)
		).toBe('Clicked element ([0]<button>Submit />).')
	})
})
