// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'

import { InPageLauncher } from './InPageLauncher'

function nextTask(): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, 0))
}

describe('InPageLauncher document footprint', () => {
	afterEach(() => {
		document.body.replaceChildren()
		vi.restoreAllMocks()
	})

	it('is queryable from the page document and exposes an open shadow root', () => {
		const launcher = new InPageLauncher({ onClick: () => {} })
		const pageVisibleHost = document.querySelector<HTMLElement>('#page-agent-inpage-launcher')

		expect(pageVisibleHost).toBe(launcher.element)
		expect(pageVisibleHost?.parentElement).toBe(document.body)
		expect(pageVisibleHost?.shadowRoot).not.toBeNull()
		expect(pageVisibleHost?.shadowRoot?.mode).toBe('open')
		expect(pageVisibleHost?.shadowRoot?.querySelector('button')).not.toBeNull()

		launcher.dispose()
	})

	it('lets a document capture listener observe a launcher click path', () => {
		const onClick = vi.fn()
		const launcher = new InPageLauncher({ onClick })
		const button = launcher.element.shadowRoot?.querySelector<HTMLButtonElement>('button')
		let capturedEvent: Event | null = null
		const capture = (event: Event) => {
			capturedEvent = event
		}
		document.addEventListener('click', capture, true)

		button?.click()

		expect(onClick).toHaveBeenCalledOnce()
		expect(capturedEvent).not.toBeNull()
		expect(capturedEvent?.composedPath()).toContain(launcher.element)

		document.removeEventListener('click', capture, true)
		launcher.dispose()
	})

	it('lets a document observer see launcher insertion and removal', async () => {
		const added: Node[] = []
		const removed: Node[] = []
		const observer = new MutationObserver((mutations) => {
			for (const mutation of mutations) {
				added.push(...mutation.addedNodes)
				removed.push(...mutation.removedNodes)
			}
		})
		observer.observe(document.body, { childList: true })

		const launcher = new InPageLauncher({ onClick: () => {} })
		await nextTask()
		expect(added).toContain(launcher.element)

		launcher.dispose()
		await nextTask()
		expect(removed).toContain(launcher.element)

		observer.disconnect()
	})
})
