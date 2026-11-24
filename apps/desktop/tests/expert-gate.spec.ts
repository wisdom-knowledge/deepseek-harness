import { describe, expect, it, vi } from 'vitest'
import { validateExpertQuestion } from '../src/expert-gate.ts'

const eligible = { uuid_valid: true, binding_valid: true, project_id: 229, status: 'CLAIMED' }
describe('expert desktop question eligibility', () => {
  it.each([
    [{ uuid_valid: false, binding_valid: false, project_id: 230, status: 'REJECTED' }, 'uuid'],
    [{ binding_valid: false, current_talent_id: null, project_id: 10 }, 'unassigned'],
    [{ binding_valid: false, current_talent_id: 19, project_id: 230, status: 'APPROVED' }, 'binding'],
    [{ project_id: 10, status: 'REJECTED' }, 'project'],
    [{ status: 'REJECTED' }, 'rejected'],
    [{ status: 'APPROVED' }, 'approved'],
    [{ status: null }, 'response'],
    [{ uuid_valid: undefined }, 'response'],
    [{ binding_valid: undefined }, 'response'],
    [{ project_id: undefined }, 'response'],
    [{ status: undefined }, 'response'],
    [{ status: 'UNKNOWN' }, 'response'],
    [{ status: 'PENDING_REPAIR' }, null],
    [{ status: 'PENDING_CLAIM' }, null],
    [{ status: 'RELEASED' }, null],
    [{ status: 'INIT' }, null],
    [{ status: 'PENDING_AUDIT' }, null],
    [{}, null],
  ] as const)('returns the first applicable decision for %o', async (fields, issue) => {
    const request = vi.fn(async () => Response.json({ code: 0, data: { ...eligible, ...fields } }))
    expect(await validateExpertQuestion(' question ', '17', request)).toBe(issue)
    expect(request).toHaveBeenCalledWith(expect.stringContaining('/binding/validate'), expect.objectContaining({
      body: JSON.stringify({ uuid: 'question', talent_id: 17 }),
    }))
  })

  it('keeps invalid inputs and unavailable results outside the workspace', async () => {
    const offline = vi.fn(async () => { throw new Error('offline') })
    for (const talent of ['', '0', '-1', '4.5', 'abc', '9007199254740992']) {
      expect(await validateExpertQuestion('question', talent, offline)).toBe('talent')
    }
    expect(await validateExpertQuestion(' ', '17', offline)).toBe('uuid')
    expect(offline).not.toHaveBeenCalled()
    expect(await validateExpertQuestion('question', '17', offline)).toBe('network')
    expect(await validateExpertQuestion('question', '17', async () => Response.json({ code: 1 }))).toBe('response')
    expect(await validateExpertQuestion('question', '17', async () => new Response('unavailable', { status: 503 }))).toBe('network')
    expect(await validateExpertQuestion('question', '17', async () => new Response('invalid json'))).toBe('response')
  })

  it('reports the request deadline as unavailable', async () => {
    const deadline = new AbortController()
    const timeout = vi.spyOn(AbortSignal, 'timeout').mockReturnValue(deadline.signal)
    try {
      const result = validateExpertQuestion('question', '17', async (_url, options) => {
        return new Promise<Response>((_resolve, reject) => {
          options!.signal!.addEventListener('abort', () => reject(deadline.signal.reason), { once: true })
        })
      })
      expect(timeout).toHaveBeenCalledWith(12_000)
      deadline.abort()
      expect(await result).toBe('network')
    } finally { timeout.mockRestore() }
  })
})
