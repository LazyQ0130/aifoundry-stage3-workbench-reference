import assert from 'node:assert/strict'
import test from 'node:test'
import { allowAiRequest } from '../lib/request-work-budget.ts'
import { reserveForProviderMode, reserveProviderUnits } from '../lib/provider-work-budget.ts'
import { ProviderSseParser } from '../lib/provider-sse.ts'

test('HTTP request guard still permits five calls per minute', () => {
  const user = 987654
  for (let i = 0; i < 5; i++) assert.equal(allowAiRequest(user, 0), true)
  assert.equal(allowAiRequest(user, 0), false)
  assert.equal(allowAiRequest(user, 60_000), true)
})

test('Provider work reserves eight units atomically and Mock does not spend them', () => {
  const user = 987655
  assert.equal(reserveForProviderMode('mock', user, 8, 0), true)
  assert.equal(reserveProviderUnits(user, 1, 0), true)
  assert.equal(reserveProviderUnits(user, 2, 0), true)
  assert.equal(reserveProviderUnits(user, 8, 0), false)
  assert.equal(reserveProviderUnits(user, 7, 0), true)
  assert.equal(reserveProviderUnits(user, 1, 0), false)
  assert.equal(reserveProviderUnits(user, 8, 60_000), true)
})

test('stream finish_reason=length remains a finish frame before DONE', () => {
  const parser = new ProviderSseParser()
  const bytes = new TextEncoder().encode('data: {"choices":[{"delta":{"content":"partial"}}]}\n\ndata: {"choices":[{"finish_reason":"length"}]}\n\ndata: [DONE]\n\n')
  assert.deepEqual(parser.push(bytes), [
    { type: 'delta', text: 'partial' },
    { type: 'finish', reason: 'length' },
  ])
  parser.finish()
  assert.equal(parser.done, true)
})
