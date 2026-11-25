/** Main-process client for the expert cloud function. Credentials never cross welcome IPC. */
import { z } from 'zod'
import type { ExpertGateIssue } from './welcome-api.ts'

const denied = z.enum(['uuid', 'talent', 'unassigned', 'binding', 'project', 'rejected', 'approved',
  'inventory', 'key_conflict', 'identity', 'network', 'response'])
const granted = z.object({ allowed: z.literal(true), api_key: z.string().regex(/^[\x21-\x7e]+$/u) })
type Admission = { issue: ExpertGateIssue } | { apiKey: string }

/**
 * Request a freshly verified assignment for this launch with a 20-second deadline.
 * @param uuid - Question identifier from the form.
 * @param talentId - Claimant's decimal ID.
 * @param origin - HTTPS origin of the expert gateway.
 * @param request - Main-process transport for the authenticated gateway.
 * @returns a localized failure code or this run's model credential.
 */
export async function requestExpertKey(uuid: unknown, talentId: unknown, origin: string | undefined, request = fetch): Promise<Admission> {
  if (typeof uuid !== 'string' || !uuid.trim()) return { issue: 'uuid' }
  if (typeof talentId !== 'string' || !/^\d+$/.test(talentId) || !Number.isSafeInteger(Number(talentId)) || Number(talentId) <= 0) {
    return { issue: 'talent' }
  }
  if (!origin || !URL.canParse(origin)) return { issue: 'network' }
  const url = new URL(origin)
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) return { issue: 'network' }
  let response: Response
  try {
    response = await request(new URL('/v1/questions/claim-key', url), {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ uuid: uuid.trim(), talent_id: Number(talentId) }),
      cache: 'no-store', redirect: 'error', credentials: 'include', signal: AbortSignal.timeout(20_000),
    })
  } catch { return { issue: 'network' } }
  if (response.status === 401 || response.status === 403) return { issue: 'identity' }
  if (!response.ok) return { issue: response.status === 502 ? 'response' : 'network' }
  try {
    const body: unknown = await response.json()
    const key = granted.safeParse(body)
    if (key.success) return { apiKey: key.data.api_key }
    const failure = z.object({ allowed: z.literal(false), reason: denied }).safeParse(body)
    return { issue: failure.success ? failure.data.reason : 'response' }
  } catch { return { issue: 'response' } }
}
