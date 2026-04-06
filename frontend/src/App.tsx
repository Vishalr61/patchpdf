import { useCallback, useEffect, useRef, useState } from 'react'
import { postExportPdf } from './api/export'
import { postPlanPdf } from './api/plan'
import { postRewrite } from './api/rewrite'
import { PdfViewer } from './components/PdfViewer'
import { SelectionPanel } from './components/SelectionPanel'
import type { PageSelectionDetail } from './hooks/usePdfSelection'
import type { AcceptedPatch, BBox, PlanResolvedEdit, RewriteProposal } from './types/patch'

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export default function App() {
  const [pdfFile, setPdfFile] = useState<File | null>(null)
  const [pdfData, setPdfData] = useState<ArrayBuffer | null>(null)
  const [viewerPage, setViewerPage] = useState(1)
  const [numPages, setNumPages] = useState(0)
  const [selection, setSelection] = useState<PageSelectionDetail>({
    text: '',
    page: 1,
    bbox: null,
  })
  const [instruction, setInstruction] = useState('')
  const [proposal, setProposal] = useState<RewriteProposal | null>(null)
  const [acceptedPatches, setAcceptedPatches] = useState<AcceptedPatch[]>([])
  const [rewriteLoading, setRewriteLoading] = useState(false)
  const [rewriteError, setRewriteError] = useState<string | null>(null)
  const [exportLoading, setExportLoading] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)
  const [planEdits, setPlanEdits] = useState<PlanResolvedEdit[] | null>(null)
  const [planLoading, setPlanLoading] = useState(false)
  const [planError, setPlanError] = useState<string | null>(null)

  const selectionPanelRef = useRef<HTMLElement | null>(null)
  const viewerPaneRef = useRef<HTMLElement | null>(null)
  const viewerMayClearSelectionRef = useRef(false)

  const onNumPages = useCallback((n: number) => {
    setNumPages(n)
  }, [])

  useEffect(() => {
    const onPointerDownCapture = (e: PointerEvent) => {
      const t = e.target as Node
      const inPanel = selectionPanelRef.current?.contains(t) ?? false
      const inViewer = viewerPaneRef.current?.contains(t) ?? false
      if (inPanel) {
        viewerMayClearSelectionRef.current = false
        return
      }
      if (inViewer) {
        viewerMayClearSelectionRef.current = true
      }
    }
    document.addEventListener('pointerdown', onPointerDownCapture, true)
    return () =>
      document.removeEventListener('pointerdown', onPointerDownCapture, true)
  }, [])

  const handleSelectionChange = useCallback((detail: PageSelectionDetail) => {
    setSelection((prev) => {
      if (detail.text.trim() && detail.bbox) {
        viewerMayClearSelectionRef.current = false
        return detail
      }
      if (!detail.text.trim()) {
        const had = prev.text.trim().length > 0 && prev.bbox
        if (had && viewerMayClearSelectionRef.current) {
          viewerMayClearSelectionRef.current = false
          return detail
        }
        viewerMayClearSelectionRef.current = false
        if (had) {
          return prev
        }
      }
      return detail
    })
  }, [])

  const goPage = useCallback(
    (next: number) => {
      const max = numPages > 0 ? numPages : 9999
      const p = Math.min(Math.max(1, next), max)
      setViewerPage(p)
      setSelection({ text: '', page: p, bbox: null })
    },
    [numPages],
  )

  const onFile = useCallback((file: File | undefined) => {
    if (!file || file.type !== 'application/pdf') {
      setPdfFile(null)
      setPdfData(null)
      return
    }
    setPdfFile(file)
    void file.arrayBuffer().then(setPdfData)
  }, [])

  useEffect(() => {
    setRewriteError(null)
    if (selection.text.trim()) {
      setProposal(null)
    }
  }, [selection.text])

  useEffect(() => {
    viewerMayClearSelectionRef.current = false
    setAcceptedPatches([])
    setProposal(null)
    setRewriteError(null)
    setExportError(null)
    setPlanEdits(null)
    setPlanError(null)
    setViewerPage(1)
    setNumPages(0)
    setSelection({ text: '', page: 1, bbox: null })
  }, [pdfData])

  const onRewrite = useCallback(async () => {
    const text = selection.text.trim()
    if (!text) return
    if (!selection.bbox) {
      setRewriteError(
        'Could not read the selection box. Click once in the PDF, then select text again.',
      )
      return
    }

    setRewriteLoading(true)
    setRewriteError(null)
    setProposal(null)

    try {
      const { replacement_text } = await postRewrite(text, instruction)
      setProposal({
        originalText: text,
        instruction,
        replacementText: replacement_text,
        page: selection.page,
        bbox: selection.bbox,
      })
    } catch (e) {
      setRewriteError(e instanceof Error ? e.message : 'Rewrite failed')
    } finally {
      setRewriteLoading(false)
    }
  }, [selection.text, selection.bbox, selection.page, instruction])

  const onRegenerateProposal = useCallback(async () => {
    if (!proposal) return
    setRewriteLoading(true)
    setRewriteError(null)
    try {
      const { replacement_text } = await postRewrite(
        proposal.originalText,
        instruction,
        { previousReplacement: proposal.replacementText },
      )
      setProposal({
        ...proposal,
        instruction,
        replacementText: replacement_text,
      })
    } catch (e) {
      setRewriteError(e instanceof Error ? e.message : 'Regenerate failed')
    } finally {
      setRewriteLoading(false)
    }
  }, [proposal, instruction])

  const onAcceptProposal = useCallback(() => {
    if (!proposal) return
    const patch: AcceptedPatch = {
      ...proposal,
      id: crypto.randomUUID(),
    }
    setAcceptedPatches((prev) => [...prev, patch])
    setProposal(null)
  }, [proposal])

  const onRejectProposal = useCallback(() => {
    setProposal(null)
  }, [])

  const onExport = useCallback(async () => {
    if (!pdfFile || acceptedPatches.length === 0) return

    setExportLoading(true)
    setExportError(null)
    try {
      const blob = await postExportPdf(pdfFile, acceptedPatches)
      downloadBlob(blob, 'patched.pdf')
    } catch (e) {
      setExportError(e instanceof Error ? e.message : 'Export failed')
    } finally {
      setExportLoading(false)
    }
  }, [pdfFile, acceptedPatches])

  const onGenerateDocumentPlan = useCallback(async () => {
    if (!pdfFile || !instruction.trim()) return
    setPlanLoading(true)
    setPlanError(null)
    setPlanEdits(null)
    try {
      const { edits } = await postPlanPdf(pdfFile, instruction)
      setPlanEdits(edits)
    } catch (e) {
      setPlanError(e instanceof Error ? e.message : 'Plan failed')
    } finally {
      setPlanLoading(false)
    }
  }, [pdfFile, instruction])

  const onImportResolvedPlan = useCallback(() => {
    if (!planEdits?.length) return
    const additions: AcceptedPatch[] = planEdits
      .filter(
        (e) =>
          e.bbox &&
          e.bbox.length === 4 &&
          !e.error,
      )
      .map((e) => ({
        id: crypto.randomUUID(),
        originalText: e.find,
        replacementText: e.replace,
        instruction,
        page: e.page,
        bbox: e.bbox as BBox,
      }))
    if (additions.length === 0) return
    setAcceptedPatches((prev) => [...prev, ...additions])
  }, [planEdits, instruction])

  return (
    <div className="app">
      <header className="header">
        <h1>PatchPDF</h1>
        <p className="tagline">Upload a PDF, highlight text, and rewrite with AI assistance</p>
        <label className="file-label">
          <span className="file-button">Choose PDF</span>
          <input
            type="file"
            accept="application/pdf"
            className="sr-only"
            onChange={(e) => onFile(e.target.files?.[0])}
          />
        </label>
      </header>
      <div className="workspace">
        <main ref={viewerPaneRef} className="viewer-pane">
          {pdfData && numPages > 1 ? (
            <div className="pdf-page-toolbar">
              <button
                type="button"
                className="page-nav-button"
                onClick={() => goPage(viewerPage - 1)}
                disabled={viewerPage <= 1}
              >
                Previous page
              </button>
              <span className="page-indicator">
                Page {viewerPage} of {numPages}
              </span>
              <button
                type="button"
                className="page-nav-button"
                onClick={() => goPage(viewerPage + 1)}
                disabled={viewerPage >= numPages}
              >
                Next page
              </button>
            </div>
          ) : null}
          <PdfViewer
            data={pdfData}
            pageNumber={viewerPage}
            onNumPages={onNumPages}
            onSelectionChange={handleSelectionChange}
          />
        </main>
        <SelectionPanel
          ref={selectionPanelRef}
          selectedText={selection.text}
          instruction={instruction}
          onInstructionChange={setInstruction}
          onRewrite={onRewrite}
          onRegenerateProposal={onRegenerateProposal}
          rewriteLoading={rewriteLoading}
          rewriteError={rewriteError}
          proposal={proposal}
          onAcceptProposal={onAcceptProposal}
          onRejectProposal={onRejectProposal}
          acceptedPatches={acceptedPatches}
          canExport={Boolean(pdfFile) && acceptedPatches.length > 0}
          exportLoading={exportLoading}
          exportError={exportError}
          onExport={onExport}
          planEdits={planEdits}
          planLoading={planLoading}
          planError={planError}
          onGenerateDocumentPlan={onGenerateDocumentPlan}
          onImportResolvedPlan={onImportResolvedPlan}
          hasPdfFile={Boolean(pdfFile)}
        />
      </div>
    </div>
  )
}
