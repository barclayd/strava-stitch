import { test } from 'node:test'
import assert from 'node:assert/strict'
import { analyticsDevice } from './analytics-device.ts'
import type { AnalyticsDevice } from '../analytics.ts'

test('common phone, tablet and desktop browser headers produce only broad device categories', () => {
  const cases: [string, AnalyticsDevice, string?][] = [
    [
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 Version/18.6 Mobile/15E148 Safari/604.1',
      'mobile',
    ],
    [
      'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 Chrome/140.0.0.0 Mobile Safari/537.36',
      'mobile',
      '?1',
    ],
    ['Mozilla/5.0 (Android 15; Mobile; rv:142.0) Gecko/142.0 Firefox/142.0', 'mobile'],
    [
      'Mozilla/5.0 (iPad; CPU OS 18_6 like Mac OS X) AppleWebKit/605.1.15 Version/18.6 Mobile/15E148 Safari/604.1',
      'tablet',
    ],
    [
      'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 Chrome/140.0.0.0 Safari/537.36',
      'tablet',
      '?0',
    ],
    ['Mozilla/5.0 (Android 15; Tablet; rv:142.0) Gecko/142.0 Firefox/142.0', 'tablet'],
    [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140.0.0.0 Safari/537.36',
      'desktop',
      '?0',
    ],
    [
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.6 Safari/605.1.15',
      'desktop',
    ],
    ['Mozilla/5.0 (X11; Linux x86_64; rv:142.0) Gecko/20100101 Firefox/142.0', 'desktop'],
    [
      'Mozilla/5.0 (X11; CrOS x86_64 16371.0.0) AppleWebKit/537.36 Chrome/140.0.0.0 Safari/537.36',
      'desktop',
    ],
  ]
  for (const [agent, expected, hint] of cases) {
    const headers = new Headers({ 'User-Agent': agent })
    if (hint) headers.set('Sec-CH-UA-Mobile', hint)
    assert.equal(analyticsDevice(headers), expected, agent)
  }
})

test('missing, ambiguous and automated clients are not silently counted as desktop visitors', () => {
  for (const agent of [
    '',
    'custom-private-client',
    'curl/8.7.1',
    'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 Mobile Safari/537.36 (compatible; Googlebot/2.1)',
    'Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 HeadlessChrome/140.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Linux; Android 9; SHIELD Android TV) AppleWebKit/537.36 Chrome/140.0.0.0 Safari/537.36',
  ])
    assert.equal(analyticsDevice(new Headers({ 'User-Agent': agent })), 'unknown', agent)
  assert.equal(analyticsDevice(), 'unknown')
  assert.equal(analyticsDevice(new Headers({ 'Sec-CH-UA-Mobile': '?0' })), 'unknown')
  assert.equal(analyticsDevice(new Headers({ 'Sec-CH-UA-Mobile': 'invalid' })), 'unknown')
  assert.equal(analyticsDevice(new Headers({ 'Sec-CH-UA-Mobile': '?1' })), 'mobile')
})
