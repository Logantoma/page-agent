import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createVisualObservationProvider } from './VisualObservation'

const sendMessage = vi.fn()

describe('createVisualObservationProvider', () => {
	beforeEach(() => {
		sendMessage.mockReset()
		vi.stubGlobal('chrome', { runtime: { sendMessage } })
	})

	it('returns captured image data for the current target tab', async () => {
		sendMessage.mockResolvedValue({ success: true, imageUrl: 'data:image/jpeg;base64,abc' })
		const capture = createVisualObservationProvider(() => 42, () => 1_000)

		await expect(capture()).resolves.toBe('data:image/jpeg;base64,abc')
		expect(sendMessage).toHaveBeenCalledWith({ type: 'VISUAL_OBSERVATION_CAPTURE', tabId: 42 })
	})

	it('skips capture when there is no current target tab', async () => {
		const capture = createVisualObservationProvider(() => null, () => 1_000)
		await expect(capture()).resolves.toBeNull()
		expect(sendMessage).not.toHaveBeenCalled()
	})

	it('throttles attempts to below the browser capture limit', async () => {
		let time = 1_000
		sendMessage.mockResolvedValue({ success: true, imageUrl: 'data:image/jpeg;base64,abc' })
		const capture = createVisualObservationProvider(() => 42, () => time)

		await capture()
		time = 1_500
		await expect(capture()).resolves.toBeNull()
		time = 1_601
		await capture()
		expect(sendMessage).toHaveBeenCalledTimes(2)
	})
})
