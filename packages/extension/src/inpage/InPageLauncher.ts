const LAUNCHER_ID = 'page-agent-inpage-launcher'

export interface InPageLauncherOptions {
	onClick: () => void
}

/** Minimal in-page entry point. Agent lifecycle remains owned by the shell. */
export class InPageLauncher {
	readonly element: HTMLButtonElement

	#onClick: () => void
	#disposed = false

	constructor(options: InPageLauncherOptions) {
		this.#onClick = options.onClick
		this.element = this.#createElement()

		const existing = document.getElementById(LAUNCHER_ID)
		if (existing) {
			existing.replaceWith(this.element)
		} else {
			this.mount()
		}
	}

	mount(target: HTMLElement = document.body): void {
		if (this.#disposed || this.element.parentElement === target) return
		target.appendChild(this.element)
	}

	show(): void {
		if (this.#disposed) return
		this.element.style.display = 'flex'
	}

	hide(): void {
		if (this.#disposed) return
		this.element.style.display = 'none'
	}

	dispose(): void {
		if (this.#disposed) return
		this.#disposed = true
		this.element.removeEventListener('click', this.#onClick)
		this.element.remove()
	}

	#createElement(): HTMLButtonElement {
		const element = document.createElement('button')
		element.id = LAUNCHER_ID
		element.type = 'button'
		element.textContent = 'PA'
		element.title = '打开 Page Agent'
		element.setAttribute('aria-label', '打开 Page Agent')
		element.setAttribute('data-browser-use-ignore', 'true')
		element.setAttribute('data-page-agent-ignore', 'true')
		Object.assign(element.style, {
			position: 'fixed',
			right: '24px',
			bottom: '24px',
			width: '48px',
			height: '48px',
			border: 'none',
			borderRadius: '50%',
			background: '#111827',
			color: '#ffffff',
			cursor: 'pointer',
			fontFamily: 'system-ui, sans-serif',
			fontSize: '14px',
			fontWeight: '700',
			lineHeight: '1',
			display: 'flex',
			alignItems: 'center',
			justifyContent: 'center',
			zIndex: '2147483646',
			boxShadow: '0 4px 12px rgba(0, 0, 0, 0.24)',
		})
		element.addEventListener('click', this.#onClick)
		return element
	}
}
