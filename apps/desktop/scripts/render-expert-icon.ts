/** Render the expert edition application, tray and installer artwork from the company logo. */

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import sharp from 'sharp'
import { packIco, TRAY_ICON_SIZES } from './render-tray-icon.ts'

const logo = await readFile(new URL('../renderer/assets/expert-company-logo.svg', import.meta.url), 'utf8')
const wordmarkViewBox = 'viewBox="0 0 333.03 77.1"'
if (!logo.includes(wordmarkViewBox)) throw new Error('expert icon: company logo dimensions changed')
const mark = Buffer.from(logo.replace(wordmarkViewBox, 'viewBox="0 0 77.1 77.1"'))

const tile = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <defs>
    <linearGradient id="tile" x1="0" y1="1" x2="1" y2="0">
      <stop stop-color="#e7e7e7"/>
      <stop offset=".55" stop-color="#fafafa"/>
      <stop offset="1" stop-color="#f5f5f5"/>
    </linearGradient>
  </defs>
  <rect x="100" y="100" width="824" height="824" rx="184" fill="url(#tile)"/>
</svg>`)
const markImage = await sharp(mark, { density: 768 }).trim().resize(544, 544, { fit: 'inside' })
  .greyscale().linear(0.33, 5).toColourspace('srgb').png().toBuffer()
const icon = await sharp(tile).composite([{ input: markImage, gravity: 'center' }]).png().toBuffer()
const tray = packIco(await Promise.all(TRAY_ICON_SIZES.map(async size => ({
  size,
  png: await sharp(icon).resize(size, size).png().toBuffer(),
}))))

await Promise.all([
  writeFile(new URL('../resources/icon-expert.png', import.meta.url), icon),
  writeFile(new URL('../resources/tray-expert-windows.ico', import.meta.url), tray),
])

const installerAssets = new URL('../installer/assets/expert/', import.meta.url)
await mkdir(installerAssets, { recursive: true })
for (const dark of [false, true]) {
  const source = dark ? logo.replace('<svg ', '<svg fill="white" ') : logo
  const background = dark ? '#151517' : '#ffffff'
  for (const scale of [1, 2]) {
    const width = 332 * scale
    const wordmark = await sharp(Buffer.from(source), { density: 144 }).resize({ width }).png().toBuffer()
    const banner = sharp({ create: { width: 600 * scale, height: 196 * scale, channels: 3, background } })
      .composite([{ input: wordmark, gravity: 'center' }])
    const filename = `brand${dark ? '-dark' : ''}${scale === 2 ? '-2x' : ''}.png`
    await writeFile(new URL(filename, installerAssets), await banner.png().toBuffer())
  }
}
const sidebarLogo = await sharp(Buffer.from(logo)).resize({ width: 140 }).png().toBuffer()
await writeFile(new URL('uninstaller-sidebar.png', installerAssets), await sharp({
  create: { width: 164, height: 314, channels: 3, background: '#ffffff' },
}).composite([{ input: sidebarLogo, gravity: 'center' }]).png().toBuffer())
