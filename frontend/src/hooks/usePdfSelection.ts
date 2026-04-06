import { type RefObject, useEffect, useRef } from 'react'

export type PageSelectionDetail = {
  text: string
  page: number
  bbox: [number, number, number, number] | null
}

/** Minimal viewport surface needed to map DOM selection to PDF coordinates. */
export type ViewportForBbox = {
  width: number
  height: number
  convertToPdfPoint: (x: number, y: number) => number[]
}

function unionPdfBBox(
  viewport: ViewportForBbox,
  root: HTMLElement,
  range: Range,
): [number, number, number, number] | null {
  const rootRect = root.getBoundingClientRect()
  const rects = range.getClientRects()
  let minVx = Infinity
  let minVy = Infinity
  let maxVx = -Infinity
  let maxVy = -Infinity

  for (let i = 0; i < rects.length; i++) {
    const r = rects[i]
    if (r.width === 0 && r.height === 0) continue
    minVx = Math.min(minVx, r.left - rootRect.left)
    minVy = Math.min(minVy, r.top - rootRect.top)
    maxVx = Math.max(maxVx, r.right - rootRect.left)
    maxVy = Math.max(maxVy, r.bottom - rootRect.top)
  }

  if (!Number.isFinite(minVx)) return null

  const pad = 0.5
  minVx = Math.max(0, minVx - pad)
  minVy = Math.max(0, minVy - pad)
  maxVx = Math.min(viewport.width, maxVx + pad)
  maxVy = Math.min(viewport.height, maxVy + pad)

  const corners: [number, number][] = [
    [minVx, minVy],
    [maxVx, minVy],
    [minVx, maxVy],
    [maxVx, maxVy],
  ]
  const pdfPts = corners.map(([vx, vy]) => viewport.convertToPdfPoint(vx, vy))
  const xs = pdfPts.map((p) => p[0])
  const ys = pdfPts.map((p) => p[1])
  return [
    Math.min(...xs),
    Math.min(...ys),
    Math.max(...xs),
    Math.max(...ys),
  ]
}

/**
 * Reports text + PDF-space bbox for the current window selection inside `rootRef`.
 */
export function usePdfSelection(
  rootRef: RefObject<HTMLElement | null>,
  viewportRef: RefObject<ViewportForBbox | null>,
  pageNumber: number,
  onChange: (detail: PageSelectionDetail) => void,
) {
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  useEffect(() => {
    const readSelection = () => {
      const root = rootRef.current
      const viewport = viewportRef.current
      const sel = window.getSelection()

      if (!root || !viewport || !sel || sel.rangeCount === 0) {
        onChangeRef.current({ text: '', page: pageNumber, bbox: null })
        return
      }
      if (sel.isCollapsed) {
        onChangeRef.current({ text: '', page: pageNumber, bbox: null })
        return
      }

      const range = sel.getRangeAt(0)
      if (!root.contains(range.commonAncestorContainer)) {
        onChangeRef.current({ text: '', page: pageNumber, bbox: null })
        return
      }

      const text = sel.toString().replace(/\u00a0/g, ' ')
      const bbox = unionPdfBBox(viewport, root, range)
      onChangeRef.current({ text, page: pageNumber, bbox })
    }

    document.addEventListener('selectionchange', readSelection)
    document.addEventListener('mouseup', readSelection)
    document.addEventListener('pointerup', readSelection)
    document.addEventListener('touchend', readSelection, { passive: true })

    return () => {
      document.removeEventListener('selectionchange', readSelection)
      document.removeEventListener('mouseup', readSelection)
      document.removeEventListener('pointerup', readSelection)
      document.removeEventListener('touchend', readSelection)
    }
  }, [rootRef, viewportRef, pageNumber])
}
