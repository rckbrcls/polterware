export const SECTION_MARKER = 'VITALS_SECTION'

export function splitSections(raw: string): Record<string, string> {
  const sections: Record<string, string> = {}
  const lines = raw.split('\n')
  let current: string | null = null
  const buf: string[] = []

  const flush = () => {
    if (current !== null) {
      sections[current] = buf.join('\n').trim()
      buf.length = 0
    }
  }

  for (const line of lines) {
    if (line.startsWith(`${SECTION_MARKER} `)) {
      flush()
      current = line.slice(SECTION_MARKER.length + 1).trim()
      continue
    }
    if (current !== null) {
      buf.push(line)
    }
  }
  flush()
  return sections
}

/** Line the streaming fallback script prints after each complete sample. */
export const FRAME_END_LINE = `${SECTION_MARKER} end\n`

const MAX_FRAME_BUFFER = 4 * 1024 * 1024

/** Splits a streamed script output into complete samples. */
export class SectionFrameBuffer {
  private buf = ''

  push(chunk: string): string[] {
    this.buf += chunk
    const frames: string[] = []
    let idx = this.buf.indexOf(FRAME_END_LINE)
    while (idx >= 0) {
      frames.push(this.buf.slice(0, idx))
      this.buf = this.buf.slice(idx + FRAME_END_LINE.length)
      idx = this.buf.indexOf(FRAME_END_LINE)
    }
    if (this.buf.length > MAX_FRAME_BUFFER) this.buf = ''
    return frames
  }

  reset(): void {
    this.buf = ''
  }
}
