import type { AcceptedPatch } from '../types/patch'

const baseUrl = () =>
  (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, '') ||
  'http://127.0.0.1:8000'

export async function postExportPdf(
  file: File,
  patch: AcceptedPatch,
): Promise<Blob> {
  const form = new FormData()
  form.append('file', file)
  form.append(
    'patch',
    JSON.stringify({
      page: patch.page,
      bbox: patch.bbox,
      replacement_text: patch.replacementText,
    }),
  )

  const res = await fetch(`${baseUrl()}/export`, {
    method: 'POST',
    body: form,
  })

  if (!res.ok) {
    let message = `${res.status} ${res.statusText}`
    const raw = await res.text()
    if (raw) {
      try {
        const body = JSON.parse(raw) as { detail?: unknown }
        if (typeof body.detail === 'string') message = body.detail
        else message = raw.slice(0, 200)
      } catch {
        message = raw.slice(0, 200)
      }
    }
    throw new Error(message)
  }

  return res.blob()
}
