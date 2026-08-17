import { describe, expect, it } from 'vitest'

import { sanitizeRequestForDebug } from './sanitizeRequestForDebug'

describe('sanitizeRequestForDebug', () => {
	it('removes inline image payloads while preserving request structure', () => {
		const request = {
			model: 'vision-model',
			messages: [
				{
					role: 'user',
					content: [
						{ type: 'text', text: 'hello' },
						{
							type: 'image_url',
							image_url: { url: 'data:image/jpeg;base64,AAAABBBB' },
						},
					],
				},
			],
		}

		const sanitized = sanitizeRequestForDebug(request) as any
		expect(sanitized.messages[0].content[0].text).toBe('hello')
		expect(sanitized.messages[0].content[1].image_url.url).toBe('[inline image omitted]')
		expect(request.messages[0].content[1].image_url.url).toContain('AAAABBBB')
	})

	it('leaves normal URLs unchanged', () => {
		expect(sanitizeRequestForDebug('https://example.com/image.png')).toBe(
			'https://example.com/image.png'
		)
	})
})
