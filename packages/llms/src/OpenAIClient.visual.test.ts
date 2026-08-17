import { describe, expect, it, vi } from 'vitest'
import * as z from 'zod/v4'

import { OpenAIClient } from './OpenAIClient'
import { parseLLMConfig } from './index'
import type { Message, Tool } from './types'

function jsonResponse(body: unknown): Response {
	return new Response(JSON.stringify(body), {
		status: 200,
		headers: { 'Content-Type': 'application/json' },
	})
}

function toolCallBody() {
	return {
		choices: [
			{
				finish_reason: 'tool_calls',
				message: {
					tool_calls: [
						{
							id: 'call_1',
							type: 'function',
							function: { name: 'done', arguments: JSON.stringify({ ok: true }) },
						},
					],
				},
			},
		],
		usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
	}
}

describe('OpenAIClient visual request handling', () => {
	it('sends the real image to the provider but sanitizes rawRequest', async () => {
		const fetchMock = vi.fn<typeof fetch>()
		fetchMock.mockResolvedValue(jsonResponse(toolCallBody()))
		const client = new OpenAIClient(
			parseLLMConfig({
				baseURL: 'https://example.test/v1',
				model: 'vision-model',
				customFetch: fetchMock,
			})
		)
		const tools: Record<string, Tool> = {
			done: {
				inputSchema: z.object({ ok: z.boolean() }),
				execute: async () => 'ok',
			},
		}
		const imageUrl = 'data:image/jpeg;base64,REAL_IMAGE_BYTES'
		const messages: Message[] = [
			{
				role: 'user',
				content: [
					{ type: 'text', text: 'inspect this' },
					{ type: 'image_url', image_url: { url: imageUrl, detail: 'low' } },
				],
			},
		]

		const result = await client.invoke(messages, tools, new AbortController().signal)
		const requestInit = fetchMock.mock.calls[0][1] as RequestInit
		const sentBody = JSON.parse(requestInit.body as string)
		expect(sentBody.messages[0].content[1].image_url.url).toBe(imageUrl)
		expect(JSON.stringify(result.rawRequest)).not.toContain('REAL_IMAGE_BYTES')
		expect(JSON.stringify(result.rawRequest)).toContain('[inline image omitted]')
	})
})
