import type { AcceptedPatch } from '../types/patch'

const baseUrl = () =>
  (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, '') ||
  'http://127.0.0.1:8000'

function patchToJson(p: AcceptedPatch) {
  return {
    page: p.page,
    bbox: p.bbox,
    original_text: p.originalText,
    replacement_text: p.replacementText,
  }
}

export type ExportMode = 'reflow' | 'overlay'

export async function postExportPdf(
  file: File,
  patches: AcceptedPatch[],
  mode: ExportMode = 'reflow',
): Promise<Blob> {
  if (patches.length === 0) {
    throw new Error('no patches to export')
  }

  const form = new FormData()
  form.append('file', file)
  form.append(
    'patches',
    JSON.stringify({ patches: patches.map(patchToJson) }),
  )
  form.append('mode', mode)

  const res = await fetch(`${baseUrl()}/export`, {
    method: 'POST',
    body: form,
  })

  if (!res.ok) {
    let message = `${res.status} ${res.statusText}`
    const raw = await res.text()
    if (raw) {
      try {
        const bodyJson = JSON.parse(raw) as { detail?: unknown }
        if (typeof bodyJson.detail === 'string') message = bodyJson.detail
        else message = raw.slice(0, 200)
      } catch {
        message = raw.slice(0, 200)
      }
    }
    throw new Error(message)
  }

  return res.blob()
}
