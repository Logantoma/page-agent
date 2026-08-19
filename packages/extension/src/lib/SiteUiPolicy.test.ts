import { describe, expect, it } from 'vitest'

import {
	DEFAULT_SITE_UI_POLICY,
	isSiteUiEnabled,
	resolveSiteUiOrigin,
	setSiteUiEnabled,
} from './SiteUiPolicy'

describe('SiteUiPolicy', () => {
	it('enables https sites by default', () => {
		expect(isSiteUiEnabled('https://example.com', DEFAULT_SITE_UI_POLICY)).toBe(true)
	})

	it('disables origins listed in policy', () => {
		expect(
			isSiteUiEnabled('https://example.com', {
				version: 1,
				disabledOrigins: ['https://example.com'],
			})
		).toBe(false)
	})

	it('enabling a site removes it from disabled origins', () => {
		const policy = setSiteUiEnabled('https://example.com', true, {
			version: 1,
			disabledOrigins: ['https://example.com'],
		})
		expect(policy.disabledOrigins).toEqual([])
	})

	it('disabling a site adds it to disabled origins without duplicates', () => {
		const once = setSiteUiEnabled('https://example.com', false)
		const twice = setSiteUiEnabled('https://example.com', false, once)
		expect(twice.disabledOrigins).toEqual(['https://example.com'])
	})

	it('resolves injectable http and https origins', () => {
		expect(resolveSiteUiOrigin('https://example.com/path')).toBe('https://example.com')
		expect(resolveSiteUiOrigin('http://localhost:5175/foo')).toBe('http://localhost:5175')
	})

	it('rejects non-injectable origins', () => {
		expect(resolveSiteUiOrigin('chrome://extensions')).toBeNull()
	})
})
