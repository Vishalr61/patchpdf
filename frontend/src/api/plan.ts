import type { PlanResolvedEdit } from '../types/patch'

const baseUrl = () =>
  (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, '') ||
  'http://127.0.0.1:8000'

export type PlanResponse = {
  edits: PlanResolvedEdit[]
}

export async function postPlanPdf(
  file: File,
  instruction: string,
): Promise<PlanResponse> {
  const form = new FormData()
  form.append('file', file)
  form.append('instruction', instruction)

  const res = await fetch(`${baseUrl()}/plan`, {
    method: 'POST',
    body: form,
  })

  if (!res.ok) {
    let message = `${res.status} ${res.statusText}`
    const raw = await res.text()
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as { detail?: unknown }
        if (typeof parsed.detail === 'string') message = parsed.detail
        else message = raw.slice(0, 200)
      } catch {
        message = raw.slice(0, 200)
      }
    }
    throw new Error(message)
  }

  return res.json() as Promise<PlanResponse>
}
