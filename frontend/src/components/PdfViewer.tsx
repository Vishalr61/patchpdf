import { useEffect, useRef, useState, type CSSProperties } from 'react'
import {
  getDocument,
  GlobalWorkerOptions,
  OutputScale,
  TextLayer,
  type PDFDocumentProxy,
} from 'pdfjs-dist/legacy/build/pdf.mjs'
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'
import {
  usePdfSelection,
  type PageSelectionDetail,
  type ViewportForBbox,
} from '../hooks/usePdfSelection'
import '../styles/pdfTextLayer.css'

GlobalWorkerOptions.workerSrc = workerUrl

type PdfViewerProps = {
  data: ArrayBuffer | null
  pageNumber: number
  onNumPages?: (count: number) => void
  onSelectionChange?: (detail: PageSelectionDetail) => void
}

const RENDER_SCALE = 1.25

type PageLayout = {
  width: number
  height: number
  scaleFactor: number
}

export function PdfViewer({
  data,
  pageNumber,
  onNumPages,
  onSelectionChange,
}: PdfViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const textLayerRef = useRef<HTMLDivElement>(null)
  const canvasWrapRef = useRef<HTMLDivElement>(null)
  const viewportPdfRef = useRef<ViewportForBbox | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pageLayout, setPageLayout] = useState<PageLayout | null>(null)

  usePdfSelection(canvasWrapRef, viewportPdfRef, pageNumber, (detail) => {
    onSelectionChange?.(detail)
  })

  useEffect(() => {
    setPageLayout(null)
    viewportPdfRef.current = null
  }, [data])

  useEffect(() => {
    if (!data || !canvasRef.current || !textLayerRef.current) return

    let cancelled = false
    let doc: PDFDocumentProxy | null = null
    let textLayer: InstanceType<typeof TextLayer> | null = null

    const render = async () => {
      setError(null)
      setPageLayout(null)
      viewportPdfRef.current = null
      const textContainer = textLayerRef.current!
      textContainer.replaceChildren()

      try {
        const task = getDocument({ data: new Uint8Array(data) })
        doc = await task.promise
        if (cancelled) return

        onNumPages?.(doc.numPages)

        const pageIndex = Math.min(
          Math.max(1, pageNumber),
          doc.numPages,
        )
        const page = await doc.getPage(pageIndex)
        if (cancelled) return

        const viewport = page.getViewport({ scale: RENDER_SCALE })
        const rd = viewport.rawDims as {
          pageWidth: number
          pageHeight: number
          pageX: number
          pageY: number
        }
        viewportPdfRef.current = {
          width: viewport.width,
          height: viewport.height,
          pdfPageWidth: rd.pageWidth,
          pdfPageHeight: rd.pageHeight,
          pdfPageX: rd.pageX,
          pdfPageY: rd.pageY,
          convertToPdfPoint: viewport.convertToPdfPoint.bind(viewport),
        }
        const outputScale = new OutputScale()
        const canvas = canvasRef.current!
        const ctx = canvas.getContext('2d', { alpha: false })
        if (!ctx) return

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
          viewportPdfRef.current = null
        }
      }
    }

    void render()

    return () => {
      cancelled = true
      textLayer?.cancel()
      textLayerRef.current?.replaceChildren()
      viewportPdfRef.current = null
      void doc?.destroy()
    }
  }, [data, pageNumber, onNumPages])

  if (!data) {
    return <p className="muted">Upload a PDF to preview it.</p>
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
      <div className="patchpdf-page" style={pageCssVars} hidden={!pageLayout}>
        <div ref={canvasWrapRef} className="patchpdf-canvas-wrap">
          <canvas ref={canvasRef} className="pdf-canvas" />
          <div ref={textLayerRef} className="textLayer" contentEditable={false} />
        </div>
      </div>
    </div>
  )
}
