import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { zipSync, strToU8 } from 'fflate'
import { it, expect, onTestFinished, vi } from 'vitest'
import { hasExpertSkill, updateExpertSkills, ExpertSkillAccessDenied } from '../src/expert-skills.ts'

const name = 'ale-task-interviewer'
function gateway(body: string, corrupt = false, skillName = name) {
  const name = skillName
  const bytes = Buffer.from(zipSync({
    [`${name}/SKILL.md`]: strToU8(`---\nname: ${name}\ndescription: Interview\n---\n${body}`),
    [`${name}/references/rules.md`]: strToU8(body),
  }))
  const sha256 = createHash('sha256').update(bytes).digest('hex')
  const request = vi.fn<typeof fetch>(async (url, init) => {
    expect(new Headers(init?.headers).get('authorization')).toBe('Bearer test-ticket')
    expect(init?.redirect).toBe('error')
    if (String(url) === 'https://gateway.test/v1/skills/manifest') return Response.json({ skills: {
      [name]: { version: 'v01', objectKey: `${name}/${name}_v01.zip`, sha256 },
    } })
    expect(String(url)).toBe('https://gateway.test/v1/skills/package')
    expect(JSON.parse(String(init?.body))).toEqual({ name, sha256 })
    return Response.json({ zip: (corrupt ? Buffer.from('broken') : bytes).toString('base64') })
  })
  return { request, root: `v01/${sha256}` }
}

it('downloads cached bundles, switches a same-version replacement and preserves the last good index on failure', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-skills-'))
  onTestFinished(() => rm(dir, { recursive: true, force: true }))
  const sync = (request: typeof fetch) => updateExpertSkills(dir, 'https://gateway.test', 'test-ticket', request)
  const first = gateway('original')
  await sync(first.request)
  first.request.mockClear()
  await sync(first.request)
  expect(first.request).toHaveBeenCalledTimes(2)
  const second = gateway('replacement')
  await sync(second.request)
  expect(await readFile(join(dir, first.root, name, 'references/rules.md'), 'utf8')).toBe('original')
  expect(await readFile(join(dir, second.root, name, 'references/rules.md'), 'utf8')).toBe('replacement')
  await expect(sync(gateway('invalid', true).request)).rejects.toThrow('digest mismatch')
  expect(JSON.parse(await readFile(join(dir, 'active.json'), 'utf8'))).toEqual([second.root])
  await sync(first.request)
  expect(JSON.parse(await readFile(join(dir, 'active.json'), 'utf8'))).toEqual([first.root])
})

it('fetches every listed ZIP on both launches, including when both are already installed', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'dsh-all-skills-'))
  onTestFinished(() => rm(directory, { recursive: true, force: true }))
  const packages = new Map([name, 'ale-rubric-builder'].map(id => [id, gateway(id, false, id)] as const))
  const calls: string[] = []
  const request: typeof fetch = async (url, init) => {
    if (String(url).endsWith('/manifest')) {
      calls.push('manifest')
      return Response.json({ skills: Object.fromEntries(Array.from(packages, ([id, pkg]) => [id, {
        version: 'v01', objectKey: `${id}/${id}_v01.zip`, sha256: pkg.root.split('/')[1],
      }])) })
    }
    const id = JSON.parse(String(init?.body)).name as string
    calls.push(id)
    return packages.get(id)!.request(url, init)
  }
  for (let launch = 0; launch < 2; launch++) {
    await updateExpertSkills(directory, 'https://gateway.test', 'test-ticket', request)
    expect(calls.splice(0)).toEqual(['manifest', name, 'ale-rubric-builder'])
  }
})

it('repairs an unreadable index on the next successful download', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-skills-'))
  onTestFinished(() => rm(dir, { recursive: true, force: true }))
  await writeFile(join(dir, 'active.json'), '{')
  expect(hasExpertSkill(dir, undefined)).toBe(false)
  await updateExpertSkills(dir, 'https://gateway.test', 'test-ticket', gateway('recovered').request)
  expect(hasExpertSkill(dir, undefined)).toBe(true)
})

it.each([401, 403])('reports rejected access (%s) before installing any files', async (status) => {
  await expect(updateExpertSkills(tmpdir(), 'https://gateway.test', 'expired', async () =>
    new Response(null, { status }))).rejects.toBeInstanceOf(ExpertSkillAccessDenied)
})
