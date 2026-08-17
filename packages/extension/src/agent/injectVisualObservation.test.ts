import { describe, expect, it } from 'vitest'

import { injectVisualObservation } from './injectVisualObservation'

describe('injectVisualObservation', () => {
	it('attaches a high-detail image to the last user message without mutating the original body', () => {
		const body = {
			model: 'vision-model',
			messages: [
				{ role: 'system', content: 'system' },
				{ role: 'user', content: 'browser state' },
			],
		}

		const result = injectVisualObservation(body, 'data:image/jpeg;base64,abc')
		const messages = result.messages as any[]

		expect(body.messages[1].content).toBe('browser state')
		expect(messages[1].content).toEqual([
			{ type: 'text', text: 'browser state' },
			{
				type: 'image_url',
				image_url: { url: 'data:image/jpeg;base64,abc', detail: 'high' },
			},
			expect.objectContaining({ type: 'text' }),
		])
	})

	it('preserves existing multimodal content parts', () => {
		const body = {
			messages: [
				{
					role: 'user',
					content: [{ type: 'text', text: 'existing' }],
				},
			],
		}

		const result = injectVisualObservation(body, 'data:image/png;base64,xyz', 'high')
		const content = (result.messages as any[])[0].content
		expect(content[0]).toEqual({ type: 'text', text: 'existing' })
		expect(content[1]).toEqual({
			type: 'image_url',
			image_url: { url: 'data:image/png;base64,xyz', detail: 'high' },
		})
	})

	it('is a no-op when there is no user message', () => {
		const body = { messages: [{ role: 'system', content: 'system' }] }
		expect(injectVisualObservation(body, 'data:image/jpeg;base64,abc')).toBe(body)
	})
})
