/** Question eligibility for the expert desktop edition. */
import { z } from 'zod'
import type { ExpertGateIssue } from './welcome-api.ts'

const envelope = z.object({ code: z.literal(0), data: z.record(z.string(), z.unknown()) })
const openStatuses = new Set(['INIT', 'PENDING_CLAIM', 'RELEASED', 'CLAIMED', 'PENDING_AUDIT', 'PENDING_REPAIR'])

/**
 * Validate one question and its current claimant with Meetchances for project 229.
 * @param uuid - Question identifier from the claim link.
 * @param talentId - Decimal expert ID from the launch form.
 * @param request - HTTPS transport.
 * @returns the first blocking condition or null on success.
 */
export async function validateExpertQuestion(uuid: unknown, talentId: unknown, request = fetch): Promise<ExpertGateIssue | null> {
  if (typeof uuid !== 'string' || !uuid.trim()) return 'uuid'
  if (typeof talentId !== 'string' || !/^\d+$/.test(talentId) || !Number.isSafeInteger(Number(talentId)) || Number(talentId) <= 0) return 'talent'
  let response: Response
  try {
    response = await request('https://service.meetchances.com/api/v1/admin/question-item/binding/validate', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uuid: uuid.trim(), talent_id: Number(talentId) }),
      redirect: 'error', signal: AbortSignal.timeout(12_000),
    })
  } catch {
    return 'network'
  }
  if (!response.ok) return 'network'
  let body: unknown
  try { body = await response.json() }
  catch { return 'response' }
  const parsed = envelope.safeParse(body)
  if (!parsed.success) return 'response'
  const data = parsed.data.data
  if (typeof data.uuid_valid !== 'boolean') return 'response'
  if (!data.uuid_valid) return 'uuid'
  if (typeof data.binding_valid !== 'boolean') return 'response'
  if (!data.binding_valid) return data.current_talent_id === null ? 'unassigned' : 'binding'
  if (typeof data.project_id !== 'number') return 'response'
  if (data.project_id !== 229) return 'project'
  if (data.status === 'REJECTED') return 'rejected'
  if (data.status === 'APPROVED') return 'approved'
  return typeof data.status === 'string' && openStatuses.has(data.status) ? null : 'response'
}
