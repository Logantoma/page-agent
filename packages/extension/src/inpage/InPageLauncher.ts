import { createPsySquidLogoSvg } from './PsySquidLogoSvg'

const LAUNCHER_ID = 'page-agent-inpage-launcher'

export interface InPageLauncherOptions {
	onClick: () => void
}

/** Isolated in-page brand entry point. Agent lifecycle remains owned by the shell. */
export class InPageLauncher {
	readonly element: HTMLElement
	#button: HTMLButtonElement
	#onClick: () => void
	#disposed = false

	constructor(options: InPageLauncherOptions) {
		this.#onClick = options.onClick
		const { host, button } = this.#createElement()
		this.element = host
		this.#button = button
		const existing = document.getElementById(LAUNCHER_ID)
		if (existing) existing.replaceWith(host)
		else this.mount()
	}

	mount(target: HTMLElement = document.body): void {
		if (!this.#disposed && this.element.parentElement !== target) target.append(this.element)
	}
	show(): void {
		if (!this.#disposed) this.element.style.display = 'block'
	}
	hide(): void {
		if (!this.#disposed) this.element.style.display = 'none'
	}
	setActive(active: boolean): void {
		if (!this.#disposed) this.element.dataset.active = String(active)
	}
	setWorking(working: boolean): void {
		if (!this.#disposed) this.element.dataset.working = String(working)
	}
	dispose(): void {
		if (this.#disposed) return
		this.#disposed = true
		this.#button.removeEventListener('click', this.#onClick)
		this.element.remove()
	}

	#createElement(): { host: HTMLElement; button: HTMLButtonElement } {
		const host = document.createElement('div')
		host.id = LAUNCHER_ID
		host.dataset.active = 'false'
		host.dataset.working = 'false'
		host.setAttribute('data-browser-use-ignore', 'true')
		host.setAttribute('data-page-agent-ignore', 'true')
		Object.assign(host.style, {
			position: 'fixed',
			right: '20px',
			bottom: '20px',
			width: '44px',
			height: '44px',
			display: 'block',
			zIndex: '2147483646',
		})
		const shadow = host.attachShadow({ mode: 'open' })
		const style = document.createElement('style')
		style.textContent = `:host{display:block;width:44px;height:44px}button{all:unset;box-sizing:border-box;position:relative;display:grid;place-items:center;width:44px;height:44px;border-radius:14px;cursor:pointer;background:rgba(255,255,255,.94);border:1px solid rgba(15,23,42,.10);box-shadow:0 6px 24px rgba(15,23,42,.16);transition:transform .16s ease,box-shadow .16s ease}svg{width:27px;height:25px;display:block}button:hover{transform:translateY(-1px) scale(1.03);box-shadow:0 9px 28px rgba(15,23,42,.20)}:host([data-active="true"]) button{box-shadow:0 0 0 2px rgba(35,136,255,.25),0 6px 24px rgba(15,23,42,.16)}@media(prefers-color-scheme:dark){button{background:rgba(15,23,42,.94);border-color:rgba(255,255,255,.14)}}@media(prefers-reduced-motion:reduce){button{transition:none}button:hover{transform:none}}`
		const button = document.createElement('button')
		button.type = 'button'
		button.title = '打开 PsySquid Web'
		button.setAttribute('aria-label', '打开 PsySquid Web')
		button.append(createPsySquidLogoSvg())
		button.addEventListener('click', this.#onClick)
		shadow.append(style, button)
		return { host, button }
	}
}
