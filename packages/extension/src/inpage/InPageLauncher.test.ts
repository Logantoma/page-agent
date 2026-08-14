// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'

import { InPageLauncher } from './InPageLauncher'

describe('InPageLauncher', () => {
	afterEach(() => {
		document.body.replaceChildren()
	})

	it('creates a single ignored launcher and delegates clicks', () => {
		const onClick = vi.fn()
		const first = new InPageLauncher({ onClick })
		const second = new InPageLauncher({ onClick })

		expect(document.querySelectorAll('#page-agent-inpage-launcher')).toHaveLength(1)
		expect(second.element.getAttribute('data-browser-use-ignore')).toBe('true')
		expect(second.element.getAttribute('data-page-agent-ignore')).toBe('true')
		second.element.click()
		expect(onClick).toHaveBeenCalledOnce()

		first.dispose()
		expect(document.querySelector('#page-agent-inpage-launcher')).toBe(second.element)
	})
})
