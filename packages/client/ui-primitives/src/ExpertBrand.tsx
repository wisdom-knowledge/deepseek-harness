/** Company mark and wordmark for the managed expert Desktop edition. */

declare global {
  interface Window {
    readonly __DSH_EXPERT_DESKTOP__?: true
    /** Installed release supplied by the expert Desktop main-window preload. */
    readonly __DSH_EXPERT_VERSION__?: string
  }
}

/** @returns Whether the owning desktop preload selected the expert edition. */
export function isExpertDesktop(): boolean {
  return typeof window !== 'undefined' && window.__DSH_EXPERT_DESKTOP__ === true
}

/**
 * Render the symbol or wordmark lettering from the same company asset.
 * @param props.size - rendered height in pixels.
 * @param props.part - which portion of the asset to display.
 * @returns the selected company artwork.
 */
export function ExpertBrand({ size, part = 'mark' }: { size: number; part?: 'mark' | 'name' }) {
  const width = size * 333.03 / 77.1
  return <span aria-hidden="true" style={{ display: 'inline-flex', flex: 'none', overflow: 'hidden',
    width: part === 'mark' ? size : width - size, height: size }}>
    <img src="/assets/expert-company-logo.svg" alt="" width={width} height={size} draggable={false}
      style={{ flex: 'none', maxWidth: 'none', marginInlineStart: part === 'name' ? -size : 0 }} />
  </span>
}
