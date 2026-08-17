import type { Message, MessageContentPart } from '@page-agent/llms'

const VISUAL_CONTEXT_NOTE =
	'Visual observation: the attached image is the current visible browser viewport. Use it together with the structured browser state.'

export function injectVisualObservation(
	requestBody: Record<string, unknown>,
	imageUrl: string,
	detail: 'auto' | 'low' | 'high' = 'low'
): Record<string, unknown> {
	const messages = requestBody.messages
	if (!Array.isArray(messages) || !imageUrl) return requestBody

	let userIndex = -1
	for (let index = messages.length - 1; index >= 0; index -= 1) {
		if (isMessage(messages[index]) && messages[index].role === 'user') {
			userIndex = index
			break
		}
	}
	if (userIndex < 0) return requestBody

	const current = messages[userIndex] as Message
	const content = current.content
	const parts: MessageContentPart[] = Array.isArray(content)
		? [...content]
		: [{ type: 'text', text: typeof content === 'string' ? content : '' }]

	parts.push({ type: 'image_url', image_url: { url: imageUrl, detail } })
	parts.push({ type: 'text', text: VISUAL_CONTEXT_NOTE })

	const nextMessages = [...messages]
	nextMessages[userIndex] = { ...current, content: parts }
	return { ...requestBody, messages: nextMessages }
}

function isMessage(value: unknown): value is Message {
	return typeof value === 'object' && value !== null && 'role' in value
}
