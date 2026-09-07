import sharp from 'sharp'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

// Original code-drawn diagrams only: no athlete data or third-party marks in public artwork.
function artwork(kind: 'home' | 'guide' | 'illustration'): string {
  const illustration = kind === 'illustration'
  const height = illustration ? 675 : 630
  const title =
    kind === 'home'
      ? ['Combine your', 'Strava activities in seconds']
      : ['Two activities.', 'Every part together.']
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="${height}" viewBox="0 0 1200 ${height}">
    <rect width="1200" height="${height}" fill="#f4f5ef"/>
    <g fill="none" stroke="#e1e5da" stroke-width="1.2" opacity=".85">
      <path d="M970-40c-260 170 290 210 75 400s-95 300 215 250"/>
      <path d="M1010-40c-260 170 290 210 75 400s-95 300 215 250"/>
      <path d="M1050-40c-260 170 290 210 75 400s-95 300 215 250"/>
    </g>
    <g font-family="Arial, Helvetica, sans-serif" fill="#242923">
      <path d="M83 51H71a7 7 0 0 0 0 14h8a5 5 0 0 1 0 10H67M67 51v8m16 8v8" fill="none" stroke="#345e51" stroke-width="2.7" stroke-linecap="round"/>
      <text x="100" y="77" font-size="38" font-weight="700" letter-spacing="-2">stitch</text>
      <text x="1138" y="72" text-anchor="end" font-size="17" fill="#345e51">${kind === 'home' ? 'FREE TO USE, ALWAYS.' : 'THE STITCH GUIDE'}</text>
      <text x="62" y="175" font-size="62" font-weight="700" letter-spacing="-2">${title[0]}</text>
      <text x="62" y="245" font-size="62" font-weight="700" letter-spacing="-2" fill="#345e51">${title[1]}</text>
      <text x="65" y="292" font-size="23" fill="#586354">${kind === 'home' ? 'Runs, rides, swims and more. One sport per stitch.' : 'Original times. Recorded tracks. The pause stays a pause.'}</text>
      <rect x="64" y="340" width="1072" height="${illustration ? 247 : 207}" rx="18" fill="#fff" stroke="#dde4d7"/>
      <text x="96" y="386" font-size="15" font-weight="700" letter-spacing="1.8" fill="#586354">ONE ACTIVITY, FROM EVERY PART</text>
      <path d="M101 477c49-80 77 27 131-30s50-34 94-3 81-14 144-14" stroke="#345e51" stroke-width="8" stroke-linecap="round" fill="none"/>
      <circle cx="101" cy="477" r="9" fill="#fff" stroke="#345e51" stroke-width="4"/>
      <circle cx="470" cy="430" r="7" fill="#345e51"/>
      <path d="M716 430c38 0 47 88 96 44s75-62 116-19 103 14 167-13" stroke="#c7683f" stroke-width="8" stroke-linecap="round" fill="none"/>
      <circle cx="716" cy="430" r="7" fill="#c7683f"/>
      <circle cx="1095" cy="442" r="9" fill="#fff" stroke="#c7683f" stroke-width="4"/>
      <rect x="510" y="415" width="164" height="41" rx="20" fill="#f1f3eb"/>
      <text x="592" y="442" text-anchor="middle" font-size="18" fill="#586354">Pause preserved</text>
      <text x="99" y="523" font-size="18" fill="#345e51">Activity 1</text>
      <text x="995" y="523" font-size="18" fill="#a64d2b">Activity 2</text>
      ${illustration ? '<text x="600" y="567" text-anchor="middle" font-size="16" fill="#586354">Separate track segments. No invented movement across the gap.</text>' : ''}
      <text x="65" y="${height - 32}" font-size="17" fill="#586354">stravastitch.com</text>
      <text x="1135" y="${height - 32}" text-anchor="end" font-size="15" fill="#586354">Illustrative route</text>
    </g>
  </svg>`
}

export async function buildImages(directory: string): Promise<void> {
  const images = join(directory, 'images')
  await mkdir(images, { recursive: true })
  // The reading page uses the small, resolution-independent original; PNGs remain for sharing.
  await writeFile(join(images, 'merge-guide.svg'), artwork('illustration'))
  for (const [kind, filename] of [
    ['home', 'stitch-social.png'],
    ['guide', 'merge-guide-social.png'],
    ['illustration', 'merge-guide.png'],
  ] as const) {
    await sharp(Buffer.from(artwork(kind)))
      .png()
      .toFile(join(images, filename))
  }
  const icon = await readFile('public/favicon.svg')
  await sharp(icon).resize(96, 96).png().toFile(join(directory, 'favicon-96.png'))
  await sharp(icon).resize(180, 180).png().toFile(join(directory, 'apple-touch-icon.png'))
}
