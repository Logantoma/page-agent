// @vitest-environment happy-dom

import { afterEach, describe, expect, it } from 'vitest'

import {
	collectRedundantFormLabels,
	withRedundantFormLabelIsolation,
} from './FormLabelIsolation.content'

function makeVisible(element: HTMLElement) {
	Object.defineProperty(element, 'getClientRects', {
		configurable: true,
		value: () => [{ width: 120, height: 32 }],
	})
}

describe('FormLabelIsolation', () => {
	afterEach(() => {
		document.body.innerHTML = ''
	})

	it('collects plain labels for visible native controls but preserves independently interactive labels', () => {
		document.body.innerHTML = `
			<label id="plain" for="channel">处理通道</label>
			<select id="channel"><option>Priority</option></select>
			<label id="interactive" for="code" tabindex="0">供应商校验码</label>
			<input id="code" />
			<label id="hidden-label" for="hidden">隐藏值</label>
			<input id="hidden" type="hidden" />
		`

		makeVisible(document.getElementById('channel') as HTMLElement)
		makeVisible(document.getElementById('code') as HTMLElement)

		const labels = collectRedundantFormLabels(document)
		expect(labels.map((label) => label.id)).toEqual(['plain'])
	})

	it('marks only redundant labels during extraction and restores exact prior attributes', async () => {
		document.body.innerHTML = `
			<label id="plain" for="channel">处理通道</label>
			<select id="channel"><option>Priority</option></select>
			<label id="preexisting" for="code" data-page-agent-not-interactive="custom">供应商校验码</label>
			<input id="code" />
		`

		const channel = document.getElementById('channel') as HTMLElement
		const code = document.getElementById('code') as HTMLElement
		makeVisible(channel)
		makeVisible(code)

		const plain = document.getElementById('plain') as HTMLLabelElement
		const preexisting = document.getElementById('preexisting') as HTMLLabelElement

		const result = await withRedundantFormLabelIsolation(async () => {
			expect(plain.getAttribute('data-page-agent-not-interactive')).toBe('true')
			expect(preexisting.getAttribute('data-page-agent-not-interactive')).toBe('true')
			expect(channel.hasAttribute('data-page-agent-not-interactive')).toBe(false)
			return 'ok'
		})

		expect(result).toBe('ok')
		expect(plain.hasAttribute('data-page-agent-not-interactive')).toBe(false)
		expect(preexisting.getAttribute('data-page-agent-not-interactive')).toBe('custom')
	})

	it('restores labels when upstream extraction throws', async () => {
		document.body.innerHTML = `
			<label id="plain" for="code">校验码</label>
			<input id="code" />
		`
		makeVisible(document.getElementById('code') as HTMLElement)
		const plain = document.getElementById('plain') as HTMLLabelElement

		await expect(
			withRedundantFormLabelIsolation(async () => {
				expect(plain.getAttribute('data-page-agent-not-interactive')).toBe('true')
				throw new Error('boom')
			})
		).rejects.toThrow('boom')

		expect(plain.hasAttribute('data-page-agent-not-interactive')).toBe(false)
	})
})
