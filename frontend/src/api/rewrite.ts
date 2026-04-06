const baseUrl = () =>
  (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, '') ||
  'http://127.0.0.1:8000'

export type RewriteResponse = {
  replacement_text: string
}

export async function postRewrite(
  text: string,
  instruction: string,
): Promise<RewriteResponse> {
  const res = await fetch(`${baseUrl()}/rewrite`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, instruction }),
  })

  if (!res.ok) {
    const raw = await res.text()
    let message = `${res.status} ${res.statusText}`
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

  return res.json() as Promise<RewriteResponse>
}
