const SVG_NS = 'http://www.w3.org/2000/svg'

export const PSYSQUID_LOGO_VIEWBOX = '0 0 410 370'

/** Derived from PsySquidLogo_Master_v4.svg, source ref: 48233f0e108c7384cf59367265eb3b32de503341. */
export function createPsySquidLogoSvg(): SVGSVGElement {
	const svg = document.createElementNS(SVG_NS, 'svg')
	svg.setAttribute('viewBox', PSYSQUID_LOGO_VIEWBOX)
	svg.setAttribute('aria-hidden', 'true')
	svg.setAttribute('focusable', 'false')
	const defs = document.createElementNS(SVG_NS, 'defs')
	const gradient = document.createElementNS(SVG_NS, 'linearGradient')
	gradient.id = 'psysquid-launcher-gradient'
	gradient.setAttribute('x1', '15%')
	gradient.setAttribute('y1', '8%')
	gradient.setAttribute('x2', '88%')
	gradient.setAttribute('y2', '92%')
	for (const [offset, color] of [
		['0', '#55C8FF'],
		['.34', '#2388FF'],
		['.67', '#084BEE'],
		['1', '#061A9A'],
	]) {
		const stop = document.createElementNS(SVG_NS, 'stop')
		stop.setAttribute('offset', offset)
		stop.setAttribute('stop-color', color)
		gradient.append(stop)
	}
	defs.append(gradient)
	const path = document.createElementNS(SVG_NS, 'path')
	path.setAttribute('fill', 'url(#psysquid-launcher-gradient)')
	path.setAttribute('fill-rule', 'evenodd')
	path.setAttribute(
		'd',
		'M201 58 173 64 152 73 128 89 107 111 97 126 89 142 83 159 78 187 79 217 87 247 97 268 117 295 134 310 161 326 184 334 211 338 236 337 252 334 274 326 289 323 298 318 309 308 322 302 330 295 336 285 338 277 350 264 356 253 358 246 357 221 364 208 366 191 362 174 355 165 348 149 335 131 330 121 317 104 298 86 278 73 257 64 229 58ZM233 111l15 5 14 8 18 17 7 10 7 14 5 18v25l-1 1-1 9-9 22-10 14-10 10-13 9-63 32-4 0-1-1 1-25-16-7-10-7-14-14-9-14v-2l-4-7-5-18v-26l1-1v-5l5-16 10-18 15-16 10-7 12-6 17-5 21-1 1 1ZM325 140l8 1 4 4 5 11v6l1 1-1 10-2 5-5 4h-6l-8-9-3-8v-15l2-5ZM351 173h3l3 3 3 8v18l-3 7-3 2h-2l-3-3-3-8v-18l3-7ZM334 197l4 4 2 6-1 14-3 7-5 6-8 1-4-4-1-3v-4l-1-1 1-11 4-9 5-5ZM349 230l3 3 1 3-2 14-6 11-5 4h-3l-4-5v-9l2-7 4-7 7-7ZM317 245l3 3 1 3-1 8-2 4-8 9-4 2h-7l-4-5v-7l4-8 7-7 4-2ZM327 276l3 3v3l-4 8-8 7-4 2h-6l-3-3 1-9 11-10 5-2ZM291 283l-1 8-7 6-10 3-3-1-3-3v-4l2-4 5-5 6-3h8ZM298 306l-1 4-5 5-10 4h-4l-4-4 1-4 9-7 11-1ZM242 315v-4l6-5 12-1 2 2v4l-6 5-11 1Z'
	)
	svg.append(defs, path)
	return svg
}
