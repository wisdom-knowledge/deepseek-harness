/** Expert Desktop snapshot delivery from the committed main Session log. */
import { mkdir, readFile, readdir, writeFile, rename } from 'node:fs/promises'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { gzip } from 'node:zlib'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-agent'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import { SessionId } from '@deepseek-ai/dsh-session/types'
import { serializeSessionLog, flushLiveSessionLog } from './archive.ts'

const compress = promisify(gzip)
const safeSession = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u
const subject = /^dsh1\.([0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12})\./u

/** Expert gateway and durable recovery settings, present only in the expert profile. */
export interface TrajectoryConfig {
  readonly origin: string
  readonly directory: string
  readonly retryMs: number
}

/**
 * Bind new root Sessions to their launch question and deliver completed turns in order.
 * @param ctx - Desktop Host carrying persistence and process credentials.
 * @param config - Expert profile delivery settings.
 */
export function installTrajectorySync(ctx: Context, config: TrajectoryConfig): void {
  const gateway = new URL(config.origin)
  if (gateway.protocol !== 'https:' || gateway.origin !== config.origin) throw new Error('Invalid trajectory gateway')
  const stop = new AbortController()
  const ref = credentialRef('TRUE_SOTA_API_KEY')
  let current: Promise<void> | undefined
  async function drain(): Promise<void> {
    const ticket = (await ctx.credentials.resolve(ref))?.value
    const question = ticket && subject.exec(ticket)?.[1]
    if (!ticket || !question) return
    const root = join(config.directory, question)
    await mkdir(root, { recursive: true, mode: 0o700 })
    for (const id of await readdir(root)) {
      if (!safeSession.test(id)) continue
      stop.signal.throwIfAborted()
      try {
        const cursor = Number(await readFile(join(root, id), 'utf8'))
        if (!Number.isSafeInteger(cursor) || cursor < -1) throw new Error('Invalid trajectory cursor')
        await flushLiveSessionLog({ sessions: ctx.sessions }, SessionId(id), stop.signal)
        const handle = await ctx.sessionPersistence.open(SessionId(id), 'read', { signal: stop.signal })
        try {
          const { events } = await handle.read(cursor + 1, undefined, { signal: stop.signal })
          for (const end of events) {
            if (end.type !== 'turn/end') continue
            const prefix = await handle.read(0, end.seq + 1, { signal: stop.signal })
            const archive = await compress(serializeSessionLog(handle.header, prefix.events))
            const response = await fetch(new URL('/v1/trajectories', gateway), {
              method: 'POST', redirect: 'error', headers: { Authorization: 'Bearer ' + ticket, 'Content-Type': 'application/json' },
              body: JSON.stringify({ uuid: question, sessionId: id, turn: end.data.turn, endSeq: end.seq, archive: archive.toString('base64') }),
              signal: AbortSignal.any([stop.signal, AbortSignal.timeout(30_000)]),
            })
            if (!response.ok) throw new Error('Trajectory upload HTTP ' + response.status)
            const ack = await response.json()
            if (ack?.sessionId !== id || ack?.endSeq !== end.seq) throw new Error('Invalid trajectory acknowledgement')
            await writeFile(join(root, id + '.tmp'), String(end.seq), { mode: 0o600 })
            await rename(join(root, id + '.tmp'), join(root, id))
          }
        } finally { await handle.close() }
      } catch (error) {
        if (!stop.signal.aborted) ctx.logger.warn('Trajectory synchronization deferred for %s: %s', id, String(error))
      }
    }
  }
  function wake(): void {
    if (!stop.signal.aborted && !current) current = drain().catch((error: unknown) => {
      if (!stop.signal.aborted) ctx.logger.warn('Trajectory synchronization deferred: %s', String(error))
    }).finally(() => { current = undefined })
  }
  ctx.on('agent/created', async ({ agent, source }) => {
    const { id, header } = agent.session
    if (header.origin === 'subagent' || !safeSession.test(id)) return
    const ticket = (await ctx.credentials.resolve(ref))?.value
    const question = ticket && subject.exec(ticket)?.[1]
    if (!question) return
    const bindings = join(config.directory, 'bindings')
    await mkdir(bindings, { recursive: true, mode: 0o700 })
    const ownerOf = async (session: string): Promise<string | undefined> => {
      try { return await readFile(join(bindings, session), 'utf8') }
      catch (error) {
        if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return undefined
        throw error
      }
    }
    const owner = await ownerOf(id)
    if (owner && owner !== question) throw new Error('Session belongs to another expert question')
    if (!owner && source === 'resume') return
    if (!owner && header.isSeeded && (!header.parentSession || !safeSession.test(header.parentSession)
        || await ownerOf(header.parentSession) !== question)) return
    if (!owner) await writeFile(join(bindings, id), question, { flag: 'wx', mode: 0o600 })
    const root = join(config.directory, question)
    await mkdir(root, { recursive: true, mode: 0o700 })
    try { await writeFile(join(root, id), '-1', { flag: 'wx', mode: 0o600 }) }
    catch (error) { if (!(error instanceof Error && 'code' in error && error.code === 'EEXIST')) throw error }
  })
  ctx.on('session/event', (_session, event) => { if (event.type === 'turn/end') wake() })
  ctx.effect(() => {
    const timer = setInterval(wake, config.retryMs)
    timer.unref()
    return async () => { clearInterval(timer); stop.abort(); await current }
  })
}
