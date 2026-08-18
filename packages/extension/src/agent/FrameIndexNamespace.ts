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
