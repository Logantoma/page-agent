export interface FrameIndexRoute {
	frameId: number
	localIndex: number
}

export interface RewriteFrameContentResult {
	content: string
	nextIndex: number
}

/**
 * Rewrite frame-local PageController indices into one tab-global index space.
 * Only interactive markers at the beginning of dehydrated DOM lines are touched.
 */
export function rewriteFrameContent(
	content: string,
	frameId: number,
	startIndex: number,
	routes: Map<number, FrameIndexRoute>
): RewriteFrameContentResult {
	let nextIndex = startIndex
	const localToGlobal = new Map<number, number>()

	const rewritten = content.replace(
		/(^|\n)([\t ]*)(\*)?\[(\d+)\]/g,
		(_match, lineStart: string, indent: string, isNew: string | undefined, localRaw: string) => {
			const localIndex = Number(localRaw)
			let globalIndex = localToGlobal.get(localIndex)

			if (globalIndex === undefined) {
				globalIndex = nextIndex++
				localToGlobal.set(localIndex, globalIndex)
				routes.set(globalIndex, { frameId, localIndex })
			}

			return `${lineStart}${indent}${isNew ?? ''}[${globalIndex}]`
		}
	)

	return { content: rewritten, nextIndex }
}

/**
 * PageController action results are produced inside the target frame, so they mention
 * frame-local indices. Rewrite those references back into the tab-global index space
 * that the model originally acted on, otherwise a successful frame action can look
 * like it targeted a different top-page element.
 */
export function rewriteFrameActionMessage(
	message: string,
	route: FrameIndexRoute,
	globalIndex: number
): string {
	if (route.frameId === 0) return message

	const localIndex = route.localIndex
	let rewritten = message
		.replace(new RegExp(`\\[${localIndex}\\]`, 'g'), `[${globalIndex}]`)
		.replace(new RegExp(`\\(${localIndex}\\)`, 'g'), `(${globalIndex})`)
		.replace(new RegExp(`\\bindex ${localIndex}\\b`, 'g'), `index ${globalIndex}`)

	return `${rewritten} [frame ${route.frameId}]`
}
