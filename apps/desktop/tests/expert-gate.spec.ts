import { describe, expect, it, vi } from 'vitest'
import { requestExpertKey } from '../src/expert-gate.ts'

const origin = 'https://expert.example.test'
describe('expert key admission', () => {
  it.each(['uuid', 'binding', 'unassigned', 'project', 'rejected', 'approved', 'inventory', 'key_conflict'])(
    'keeps %s decisions outside the workspace', async (reason) => {
      const fetch = vi.fn(async () => Response.json({ allowed: false, reason }))
      expect(await requestExpertKey(' question ', '17', origin, fetch)).toEqual({ issue: reason })
      expect(fetch).toHaveBeenCalledWith(new URL(origin + '/v1/questions/claim-key'), expect.objectContaining({
        body: JSON.stringify({ uuid: 'question', talent_id: 17 }), redirect: 'error', cache: 'no-store',
      }))
    },
  )
  it('reads the current assignment on every submission', async () => {
    using timeout = vi.spyOn(AbortSignal, 'timeout')
    const fetch = vi.fn().mockResolvedValueOnce(Response.json({ allowed: true, api_key: 'fixture-a' }))
      .mockResolvedValueOnce(Response.json({ allowed: true, api_key: 'fixture-b' }))
    expect(await requestExpertKey('question', '4', origin, fetch)).toEqual({ apiKey: 'fixture-a' })
    expect(await requestExpertKey('question', '4', origin, fetch)).toEqual({ apiKey: 'fixture-b' })
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(timeout.mock.calls).toEqual([[20_000], [20_000]])
  })
  it('blocks local input errors, incomplete responses and unavailable services', async () => {
    const offline = vi.fn(async () => { throw new Error('offline') })
    for (const talent of ['', '0', '-1', '4.5', 'abc', '9007199254740992']) {
      expect(await requestExpertKey('question', talent, origin, offline)).toEqual({ issue: 'talent' })
    }
    expect(await requestExpertKey(' ', '17', origin, offline)).toEqual({ issue: 'uuid' })
    expect(await requestExpertKey('question', '17', undefined, offline)).toEqual({ issue: 'network' })
    expect(offline).not.toHaveBeenCalled()
    expect(await requestExpertKey('question', '17', origin, offline)).toEqual({ issue: 'network' })
    for (const response of [Response.json({ allowed: true }), Response.json({ allowed: true, api_key: '  ' }), new Response('bad')]) {
      expect(await requestExpertKey('question', '17', origin, async () => response)).toEqual({ issue: 'response' })
    }
    expect(await requestExpertKey('question', '17', origin, async () => new Response(null, { status: 403 }))).toEqual({ issue: 'identity' })
    expect(await requestExpertKey('question', '17', origin, async () => new Response(null, { status: 503 }))).toEqual({ issue: 'network' })
  })
})
