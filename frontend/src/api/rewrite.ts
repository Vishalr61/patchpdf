const baseUrl = () =>
  (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, '') ||
  'http://127.0.0.1:8000'

export type RewriteResponse = {
  replacement_text: string
}

export async function postRewrite(
  text: string,
  instruction: string,
  options?: { previousReplacement?: string },
): Promise<RewriteResponse> {
  const body: Record<string, string> = { text, instruction }
  if (options?.previousReplacement?.trim()) {
    body.previous_replacement = options.previousReplacement
  }

  const res = await fetch(`${baseUrl()}/rewrite`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const raw = await res.text()
    let message = `${res.status} ${res.statusText}`
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

  return res.json() as Promise<RewriteResponse>
}
