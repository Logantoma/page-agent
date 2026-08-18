// @vitest-environment happy-dom

import { beforeEach, describe, expect, it } from 'vitest'

import {
	collectAgentOwnedHitTestElements,
	withAgentUiHitTestIsolation,
} from './AgentUiHitTestIsolation.content'

describe('AgentUiHitTestIsolation', () => {
	beforeEach(() => {
		document.body.innerHTML = ''
	})

	it('collects ignored roots and descendants but not page content', () => {
		const pageInput = document.createElement('input')
		const root = document.createElement('div')
		root.setAttribute('data-page-agent-ignore', 'true')
		const child = document.createElement('button')
		root.appendChild(child)
		document.body.append(pageInput, root)

		const elements = collectAgentOwnedHitTestElements()
		expect(elements).toContain(root)
		expect(elements).toContain(child)
		expect(elements).not.toContain(pageInput)
	})

	it('temporarily disables hit testing and restores exact inline styles', async () => {
		const pageInput = document.createElement('input')
		pageInput.style.pointerEvents = 'auto'
		const root = document.createElement('div')
		root.setAttribute('data-browser-use-ignore', 'true')
		root.style.setProperty('pointer-events', 'auto')
		const child = document.createElement('div')
		child.style.setProperty('pointer-events', 'all', 'important')
		root.appendChild(child)
		document.body.append(pageInput, root)

		const result = await withAgentUiHitTestIsolation(async () => {
			expect(root.style.getPropertyValue('pointer-events')).toBe('none')
			expect(root.style.getPropertyPriority('pointer-events')).toBe('important')
			expect(child.style.getPropertyValue('pointer-events')).toBe('none')
			expect(child.style.getPropertyPriority('pointer-events')).toBe('important')
			expect(pageInput.style.getPropertyValue('pointer-events')).toBe('auto')
			return 'ok'
		})

		expect(result).toBe('ok')
		expect(root.style.getPropertyValue('pointer-events')).toBe('auto')
		expect(root.style.getPropertyPriority('pointer-events')).toBe('')
		expect(child.style.getPropertyValue('pointer-events')).toBe('all')
		expect(child.style.getPropertyPriority('pointer-events')).toBe('important')
	})

	it('restores hit testing when upstream extraction throws', async () => {
		const root = document.createElement('div')
		root.setAttribute('data-page-agent-ignore', 'true')
		root.style.pointerEvents = 'auto'
		document.body.appendChild(root)

		await expect(
			withAgentUiHitTestIsolation(async () => {
				throw new Error('upstream extraction failed')
			})
		).rejects.toThrow('upstream extraction failed')

		expect(root.style.getPropertyValue('pointer-events')).toBe('auto')
	})
})
