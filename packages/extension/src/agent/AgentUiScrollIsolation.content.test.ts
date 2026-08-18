// @vitest-environment happy-dom

import { beforeEach, describe, expect, it } from 'vitest'

import {
	collectAgentOwnedScrollCandidates,
	withAgentUiScrollIsolation,
} from './AgentUiScrollIsolation.content'

describe('AgentUiScrollIsolation', () => {
	beforeEach(() => {
		document.body.innerHTML = ''
	})

	it('collects agent-owned roots and descendants but not page content', () => {
		const page = document.createElement('main')
		const root = document.createElement('div')
		root.setAttribute('data-page-agent-ignore', 'true')
		const history = document.createElement('div')
		root.appendChild(history)
		document.body.append(page, root)

		const candidates = collectAgentOwnedScrollCandidates()
		expect(candidates).toContain(root)
		expect(candidates).toContain(history)
		expect(candidates).not.toContain(page)
	})

	it('temporarily hides overflow-y for agent ui and restores exact inline styles', async () => {
		const page = document.createElement('main')
		page.style.overflowY = 'auto'
		const root = document.createElement('div')
		root.setAttribute('data-browser-use-ignore', 'true')
		root.style.setProperty('overflow-y', 'auto')
		const history = document.createElement('div')
		history.style.setProperty('overflow-y', 'scroll', 'important')
		root.appendChild(history)
		document.body.append(page, root)

		const result = await withAgentUiScrollIsolation(async () => {
			expect(root.style.getPropertyValue('overflow-y')).toBe('hidden')
			expect(root.style.getPropertyPriority('overflow-y')).toBe('important')
			expect(history.style.getPropertyValue('overflow-y')).toBe('hidden')
			expect(history.style.getPropertyPriority('overflow-y')).toBe('important')
			expect(page.style.getPropertyValue('overflow-y')).toBe('auto')
			return 'ok'
		})

		expect(result).toBe('ok')
		expect(root.style.getPropertyValue('overflow-y')).toBe('auto')
		expect(root.style.getPropertyPriority('overflow-y')).toBe('')
		expect(history.style.getPropertyValue('overflow-y')).toBe('scroll')
		expect(history.style.getPropertyPriority('overflow-y')).toBe('important')
	})

	it('restores agent ui styles when the upstream operation throws', async () => {
		const root = document.createElement('div')
		root.setAttribute('data-page-agent-ignore', 'true')
		root.style.setProperty('overflow-y', 'auto')
		document.body.appendChild(root)

		await expect(
			withAgentUiScrollIsolation(async () => {
				throw new Error('upstream failure')
			})
		).rejects.toThrow('upstream failure')

		expect(root.style.getPropertyValue('overflow-y')).toBe('auto')
		expect(root.style.getPropertyPriority('overflow-y')).toBe('')
	})
})
