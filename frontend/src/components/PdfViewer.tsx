import { useEffect, useRef, useState, type CSSProperties } from 'react'
import {
  getDocument,
  GlobalWorkerOptions,
  OutputScale,
  TextLayer,
  type PDFDocumentProxy,
} from 'pdfjs-dist/legacy/build/pdf.mjs'
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'
import { useSelectionInRoot } from '../hooks/useSelectionInRoot'
import '../styles/pdfTextLayer.css'

GlobalWorkerOptions.workerSrc = workerUrl

type PdfViewerProps = {
  data: ArrayBuffer | null
  onSelectionChange?: (text: string) => void
}

const RENDER_SCALE = 1.25

type PageLayout = {
  width: number
  height: number
  scaleFactor: number
}

export function PdfViewer({ data, onSelectionChange }: PdfViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const textLayerRef = useRef<HTMLDivElement>(null)
  const selectRootRef = useRef<HTMLDivElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [pageLayout, setPageLayout] = useState<PageLayout | null>(null)

  useSelectionInRoot(selectRootRef, (text) => {
    onSelectionChange?.(text)
  })

  useEffect(() => {
    onSelectionChange?.('')
    setPageLayout(null)
  }, [data, onSelectionChange])

  useEffect(() => {
    if (!data || !canvasRef.current || !textLayerRef.current) return

    let cancelled = false
    let doc: PDFDocumentProxy | null = null
    let textLayer: InstanceType<typeof TextLayer> | null = null

    const render = async () => {
      setError(null)
      setPageLayout(null)
      const textContainer = textLayerRef.current!
      textContainer.replaceChildren()

      try {
        const task = getDocument({ data: new Uint8Array(data) })
        doc = await task.promise
        if (cancelled) return

        const page = await doc.getPage(1)
        if (cancelled) return

        const viewport = page.getViewport({ scale: RENDER_SCALE })
        const outputScale = new OutputScale()
        const canvas = canvasRef.current!
        const ctx = canvas.getContext('2d', { alpha: false })
        if (!ctx) return

        // Bitmap size × DPR; CSS size = viewport. TextLayer uses the same viewport +
        // OutputScale.pixelRatio internally — without this, spans misalign and clicks miss.
        canvas.width = Math.floor(viewport.width * outputScale.sx)
        canvas.height = Math.floor(viewport.height * outputScale.sy)
        canvas.style.width = `${viewport.width}px`
        canvas.style.height = `${viewport.height}px`

        const { pageWidth } = viewport.rawDims as {
          pageWidth: number
          pageHeight: number
        }
        setPageLayout({
          width: viewport.width,
          height: viewport.height,
          scaleFactor: viewport.width / pageWidth,
        })

        const renderTask = page.render({
          canvasContext: ctx,
          viewport,
          canvas,
          transform: outputScale.scaled
            ? [outputScale.sx, 0, 0, outputScale.sy, 0, 0]
            : undefined,
        })
        await renderTask.promise
        if (cancelled) return

        // Use streamTextContent() + TextLayer instead of getTextContent(): Safari/WebKit
        // does not implement async iteration over ReadableStream ("for await"), which
        // getTextContent relies on. TextLayer consumes the stream via getReader().read().
        const textContentSource = page.streamTextContent()
        if (cancelled) return

        textLayer = new TextLayer({
          textContentSource,
          container: textContainer,
          viewport,
        })
        await textLayer.render()
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Could not render PDF')
          setPageLayout(null)
        }
      }
    }

    void render()

    return () => {
      cancelled = true
      textLayer?.cancel()
      textLayerRef.current?.replaceChildren()
      void doc?.destroy()
    }
  }, [data])

  if (!data) {
    return <p className="muted">Upload a PDF to show the first page.</p>
  }

  const pageCssVars = pageLayout
    ? ({
        width: pageLayout.width,
        height: pageLayout.height,
        '--scale-factor': String(pageLayout.scaleFactor),
      } as CSSProperties)
    : undefined

  return (
    <div className="pdf-viewer">
      {error ? <p className="error">{error}</p> : null}
      <div
        ref={selectRootRef}
        className="patchpdf-page"
        style={pageCssVars}
        hidden={!pageLayout}
      >
        <div className="patchpdf-canvas-wrap">
          <canvas ref={canvasRef} className="pdf-canvas" />
          <div ref={textLayerRef} className="textLayer" contentEditable={false} />
        </div>
      </div>
    </div>
  )
}
