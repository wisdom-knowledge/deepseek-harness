/** Authenticated startup synchronization of immutable, digest-addressed expert Skill directories. */
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { unzipSync } from 'fflate'
import { load } from 'js-yaml'
import { z } from 'zod'
import { writeFileAtomic } from '@deepseek-ai/dsh-atomic-write'

const segment = z.string().regex(/^[a-z\d][a-z\d._-]{0,79}$/i)
const entry = z.object({ version: segment, sha256: z.string().regex(/^[0-9a-f]{64}$/), objectKey: z.string() })
const manifest = z.object({ skills: z.record(segment, entry) })
const archive = z.object({ zip: z.base64().max(2_796_204) })

/** Identifies a revoked or expired launch credential separately from an unavailable update. */
export class ExpertSkillAccessDenied extends Error {}

/**
 * Check for a usable startup copy of the expert interview Skill.
 * @param directory - Local published cache.
 * @param bundled - Installer's fallback root.
 * @returns whether admission can proceed during a background download.
 */
export function hasExpertSkill(directory: string, bundled: string | undefined): boolean {
  const entryPath = 'ale-task-interviewer/SKILL.md'
  if (bundled && existsSync(join(bundled, entryPath))) return true
  const index = join(directory, 'active.json')
  if (!existsSync(index)) return false
  try {
    const roots = z.array(z.string().regex(/^[a-z\d][a-z\d._-]{0,79}\/[0-9a-f]{64}$/i))
      .parse(JSON.parse(readFileSync(index, 'utf8')))
    return roots.some(root => existsSync(join(directory, root, entryPath)))
  } catch (error) {
    console.warn('Cannot read the local expert Skill index', error)
    return false
  }
}

/**
 * Check one authorized launch. Publish the index only after every referenced directory is ready.
 * @param directory - App-owned cache, shared with the expert Host.
 * @param origin - HTTPS origin already checked by the launch admission client.
 * @param ticket - Credential issued by this origin for the current launch.
 * @param request - Main-process transport or test fixture.
 */
export async function updateExpertSkills(directory: string, origin: string, ticket: string, request = fetch): Promise<void> {
  async function get(path: string, body?: object): Promise<unknown> {
    const response = await request(new URL(path, origin), {
      method: body ? 'POST' : 'GET', redirect: 'error', cache: 'no-store',
      headers: { Authorization: `Bearer ${ticket}`, 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(12_000),
    })
    if (response.status === 401 || response.status === 403) throw new ExpertSkillAccessDenied()
    if (!response.ok) throw new Error(`Skill update HTTP ${response.status}`)
    return response.json()
  }
  const { skills } = manifest.parse(await get('/v1/skills/manifest'))
  const roots: string[] = []
  for (const [name, { version, sha256, objectKey }] of Object.entries(skills)) {
    if (objectKey !== `${name}/${name}_${version}.zip`) throw new Error('Unexpected Skill object key')
    const root = `${version}/${sha256}`
    const target = join(directory, root)
    const data = archive.parse(await get('/v1/skills/package', { name, sha256 }))
    const bytes = Buffer.from(data.zip, 'base64')
    if (createHash('sha256').update(bytes).digest('hex') !== sha256) throw new Error('Skill digest mismatch')
    if (!existsSync(join(target, name, 'SKILL.md'))) {
      await install(target, name, bytes)
    }
    roots.push(root)
  }
  await writeFileAtomic(join(directory, 'active.json'), JSON.stringify(roots), { mode: 0o600, dirMode: 0o700 })
}

async function install(target: string, name: string, bytes: Uint8Array): Promise<void> {
  let expanded = 0
  const entries = unzipSync(bytes, { filter: (file) => {
    expanded += file.originalSize
    const path = file.name.replace(/\/$/, '').split('/')
    if (expanded > 16 * 1024 * 1024 || path[0] !== name || path.some(part =>
      !/^[a-z\d_.-]+$/i.test(part) || part === '.' || part === '..' || part.endsWith('.'))) throw new Error('Invalid Skill archive')
    return true
  } })
  await mkdir(dirname(target), { recursive: true })
  const staging = await mkdtemp(join(dirname(target), '.install-'))
  try {
    for (const [path, content] of Object.entries(entries)) {
      if (path.endsWith('/')) continue
      const file = join(staging, path)
      await mkdir(dirname(file), { recursive: true })
      await writeFile(file, content, { flag: 'wx' })
    }
    const instructions = await readFile(join(staging, name, 'SKILL.md'), 'utf8')
    const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(instructions)
    z.object({ name: z.literal(name), description: z.string().trim().min(1) }).parse(load(frontmatter?.[1] ?? ''))
    await rename(staging, target)
  } finally {
    await rm(staging, { recursive: true, force: true })
  }
}
