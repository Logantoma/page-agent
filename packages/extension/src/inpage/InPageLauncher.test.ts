// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'

import { InPageLauncher } from './InPageLauncher'

describe('InPageLauncher', () => {
	afterEach(() => {
		document.body.replaceChildren()
	})

	it('creates an ignored shadow host with the official SVG and delegates clicks', () => {
		const onClick = vi.fn()
		const first = new InPageLauncher({ onClick })
		const second = new InPageLauncher({ onClick })

		expect(document.querySelectorAll('#page-agent-inpage-launcher')).toHaveLength(1)
		expect(second.element.getAttribute('data-browser-use-ignore')).toBe('true')
		expect(second.element.getAttribute('data-page-agent-ignore')).toBe('true')
		expect(second.element.shadowRoot?.querySelector('button')).not.toBeNull()
		expect(second.element.shadowRoot?.querySelector('svg')?.getAttribute('viewBox')).toBe(
			'0 0 410 370'
		)
		expect(second.element.textContent).not.toContain('PS')
		second.element.shadowRoot?.querySelector('button')?.click()
		expect(onClick).toHaveBeenCalledOnce()

		first.dispose()
		expect(document.querySelector('#page-agent-inpage-launcher')).toBe(second.element)
	})

	it('controls host visibility and active working state', () => {
		const onClick = vi.fn()
		const launcher = new InPageLauncher({ onClick })
		const button = launcher.element.shadowRoot?.querySelector('button')
		launcher.hide()
		expect(launcher.element.style.display).toBe('none')
		launcher.show()
		expect(launcher.element.style.display).toBe('block')
		launcher.setActive(true)
		launcher.setWorking(true)
		expect(launcher.element.dataset.active).toBe('true')
		expect(launcher.element.dataset.working).toBe('true')
		launcher.setActive(false)
		launcher.setWorking(false)
		expect(launcher.element.dataset.active).toBe('false')
		expect(launcher.element.dataset.working).toBe('false')
		launcher.dispose()
		expect(document.querySelector('#page-agent-inpage-launcher')).toBeNull()
		button?.click()
		expect(onClick).not.toHaveBeenCalled()
	})

	it('defaults to document.body and reparents the same element', () => {
		const launcher = new InPageLauncher({ onClick: () => {} })
		const target = document.createElement('div')
		document.body.appendChild(target)

		expect(launcher.element.parentElement).toBe(document.body)
		launcher.mount(target)
		expect(launcher.element.parentElement).toBe(target)
		const element = launcher.element
		launcher.mount(target)
		expect(launcher.element).toBe(element)
		launcher.dispose()
	})
})
