import { useEffect, useRef, useState } from 'react'
import {
  getDocument,
  GlobalWorkerOptions,
  type PDFDocumentProxy,
} from 'pdfjs-dist/legacy/build/pdf.mjs'
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'

GlobalWorkerOptions.workerSrc = workerUrl

type PdfViewerProps = {
  data: ArrayBuffer | null
}

const RENDER_SCALE = 1.25

export function PdfViewer({ data }: PdfViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!data || !canvasRef.current) return

    let cancelled = false
    let doc: PDFDocumentProxy | null = null

    const render = async () => {
      setError(null)
      try {
        const task = getDocument({ data: new Uint8Array(data) })
        doc = await task.promise
        if (cancelled) return

        const page = await doc.getPage(1)
        if (cancelled) return

        const viewport = page.getViewport({ scale: RENDER_SCALE })
        const canvas = canvasRef.current!
        const ctx = canvas.getContext('2d')
        if (!ctx) return

        canvas.width = viewport.width
        canvas.height = viewport.height

        const renderTask = page.render({
          canvasContext: ctx,
          viewport,
          canvas,
        })
        await renderTask.promise
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Could not render PDF')
        }
      }
    }

    void render()

    return () => {
      cancelled = true
      void doc?.destroy()
    }
  }, [data])

  if (!data) {
    return <p className="muted">Upload a PDF to show the first page.</p>
  }

  return (
    <div className="pdf-viewer">
      {error ? <p className="error">{error}</p> : null}
      <canvas ref={canvasRef} className="pdf-canvas" />
    </div>
  )
}
