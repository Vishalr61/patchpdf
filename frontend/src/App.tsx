import { useCallback, useEffect, useRef, useState } from 'react'
import { postExportPdf, type ExportMode as ApiExportMode } from './api/export'
import { postPlanPdf } from './api/plan'
import { postRewrite } from './api/rewrite'
import { PdfViewer } from './components/PdfViewer'
import { SelectionPanel } from './components/SelectionPanel'
import type { PageSelectionDetail } from './hooks/usePdfSelection'
import type {
  AcceptedPatch,
  BBox,
  ExportMode,
  PlanResolvedEdit,
  RewriteProposal,
} from './types/patch'

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export default function App() {
  type DocState = {
    id: string
    name: string
    file: File
    data: Uint8Array
    viewerPage: number
    numPages: number
    selection: PageSelectionDetail
    instruction: string
    proposal: RewriteProposal | null
    acceptedPatches: AcceptedPatch[]
    rewriteLoading: boolean
    rewriteError: string | null
    exportLoading: boolean
    exportError: string | null
    planEdits: PlanResolvedEdit[] | null
    planLoading: boolean
    planError: string | null
  }

  const [docs, setDocs] = useState<DocState[]>([])
  const [activeDocId, setActiveDocId] = useState<string | null>(null)
  const [exportMode, setExportMode] = useState<ExportMode>('reflow')

  const activeDoc = docs.find((d) => d.id === activeDocId) ?? null

  const selectionPanelRef = useRef<HTMLElement | null>(null)
  const viewerPaneRef = useRef<HTMLElement | null>(null)
  const viewerMayClearSelectionRef = useRef(false)

  const onNumPages = useCallback(
    (n: number) => {
      if (!activeDocId) return
      setDocs((prev) =>
        prev.map((d) => (d.id === activeDocId ? { ...d, numPages: n } : d)),
      )
    },
    [activeDocId],
  )

  const jumpToPage = useCallback(
    (next: number) => {
      if (!activeDoc) return
      const max = activeDoc.numPages > 0 ? activeDoc.numPages : 9999
      const p = Math.min(Math.max(1, next), max)
      setDocs((prev) =>
        prev.map((d) =>
          d.id === activeDoc.id
            ? { ...d, viewerPage: p, selection: { text: '', page: p, bbox: null } }
            : d,
        ),
      )
    },
    [activeDoc],
  )

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

  const handleSelectionChange = useCallback(
    (detail: PageSelectionDetail) => {
      if (!activeDocId) return
      setDocs((prev) =>
        prev.map((d) => {
          if (d.id !== activeDocId) return d
          const prevSel = d.selection
          let nextSel = detail
          if (detail.text.trim() && detail.bbox) {
            viewerMayClearSelectionRef.current = false
            nextSel = detail
          } else if (!detail.text.trim()) {
            const had = prevSel.text.trim().length > 0 && prevSel.bbox
            if (had && viewerMayClearSelectionRef.current) {
              viewerMayClearSelectionRef.current = false
              nextSel = detail
            } else if (had) {
              nextSel = prevSel
            }
            viewerMayClearSelectionRef.current = false
          }
          const selectionChanged =
            Boolean(nextSel.bbox) !== Boolean(prevSel.bbox) ||
            nextSel.text !== prevSel.text ||
            String(nextSel.bbox) !== String(prevSel.bbox)

          // Only clear an existing proposal when the user makes a *new* non-empty selection.
          // Clicking around the UI often triggers selectionchange; we don't want that to
          // wipe the proposal before the user can accept it.
          const proposal =
            selectionChanged && nextSel.text.trim().length > 0 ? null : d.proposal

          return { ...d, selection: nextSel, proposal, rewriteError: null }
        }),
      )
    },
    [activeDocId],
  )

  const goPage = useCallback(
    (next: number) => {
      if (!activeDoc) return
      const max = activeDoc.numPages > 0 ? activeDoc.numPages : 9999
      const p = Math.min(Math.max(1, next), max)
      setDocs((prev) =>
        prev.map((d) =>
          d.id === activeDoc.id
            ? {
                ...d,
                viewerPage: p,
                selection: { text: '', page: p, bbox: null },
              }
            : d,
        ),
      )
    },
    [activeDoc],
  )

  const onFile = useCallback((file: File | undefined) => {
    if (!file || file.type !== 'application/pdf') return
    void file.arrayBuffer().then((data) => {
      const bytes = new Uint8Array(data)
      const doc: DocState = {
        id: crypto.randomUUID(),
        name: file.name,
        file,
        data: bytes.slice(),
        viewerPage: 1,
        numPages: 0,
        selection: { text: '', page: 1, bbox: null },
        instruction: '',
        proposal: null,
        acceptedPatches: [],
        rewriteLoading: false,
        rewriteError: null,
        exportLoading: false,
        exportError: null,
        planEdits: null,
        planLoading: false,
        planError: null,
      }
      viewerMayClearSelectionRef.current = false
      setDocs((prev) => [doc, ...prev])
      setActiveDocId(doc.id)
    })
  }, [])

  const onRewrite = useCallback(async () => {
    if (!activeDoc) return
    const text = activeDoc.selection.text.trim()
    if (!text) return
    if (!activeDoc.selection.bbox) {
      setDocs((prev) =>
        prev.map((d) =>
          d.id === activeDoc.id
            ? {
                ...d,
                rewriteError:
                  'Could not read the selection box. Click once in the PDF, then select text again.',
              }
            : d,
        ),
      )
      return
    }

    setDocs((prev) =>
      prev.map((d) =>
        d.id === activeDoc.id
          ? { ...d, rewriteLoading: true, rewriteError: null, proposal: null }
          : d,
      ),
    )

    try {
      const { replacement_text } = await postRewrite(text, activeDoc.instruction)
      setDocs((prev) =>
        prev.map((d) =>
          d.id === activeDoc.id
            ? {
                ...d,
                proposal: {
                  originalText: text,
                  instruction: d.instruction,
                  replacementText: replacement_text,
                  page: d.selection.page,
                  bbox: d.selection.bbox!,
                },
              }
            : d,
        ),
      )
    } catch (e) {
      setDocs((prev) =>
        prev.map((d) =>
          d.id === activeDoc.id
            ? { ...d, rewriteError: e instanceof Error ? e.message : 'Rewrite failed' }
            : d,
        ),
      )
    } finally {
      setDocs((prev) =>
        prev.map((d) =>
          d.id === activeDoc.id ? { ...d, rewriteLoading: false } : d,
        ),
      )
    }
  }, [activeDoc])

  const onRegenerateProposal = useCallback(async () => {
    if (!activeDoc?.proposal) return
    setDocs((prev) =>
      prev.map((d) =>
        d.id === activeDoc.id ? { ...d, rewriteLoading: true, rewriteError: null } : d,
      ),
    )
    try {
      const { replacement_text } = await postRewrite(
        activeDoc.proposal.originalText,
        activeDoc.instruction,
        { previousReplacement: activeDoc.proposal.replacementText },
      )
      setDocs((prev) =>
        prev.map((d) =>
          d.id === activeDoc.id
            ? {
                ...d,
                proposal: { ...d.proposal!, instruction: d.instruction, replacementText: replacement_text },
              }
            : d,
        ),
      )
    } catch (e) {
      setDocs((prev) =>
        prev.map((d) =>
          d.id === activeDoc.id
            ? { ...d, rewriteError: e instanceof Error ? e.message : 'Regenerate failed' }
            : d,
        ),
      )
    } finally {
      setDocs((prev) =>
        prev.map((d) =>
          d.id === activeDoc.id ? { ...d, rewriteLoading: false } : d,
        ),
      )
    }
  }, [activeDoc])

  const onAcceptProposal = useCallback(() => {
    if (!activeDoc?.proposal) return
    const patch: AcceptedPatch = { ...activeDoc.proposal, id: crypto.randomUUID() }
    setDocs((prev) =>
      prev.map((d) =>
        d.id === activeDoc.id
          ? { ...d, acceptedPatches: [...d.acceptedPatches, patch], proposal: null }
          : d,
      ),
    )
  }, [activeDoc])

  const onRejectProposal = useCallback(() => {
    if (!activeDoc) return
    setDocs((prev) =>
      prev.map((d) => (d.id === activeDoc.id ? { ...d, proposal: null } : d)),
    )
  }, [activeDoc])

  const onRemoveAcceptedPatch = useCallback((id: string) => {
    if (!activeDoc) return
    setDocs((prev) =>
      prev.map((d) =>
        d.id === activeDoc.id
          ? { ...d, acceptedPatches: d.acceptedPatches.filter((p) => p.id !== id) }
          : d,
      ),
    )
  }, [activeDoc])

  const onMoveAcceptedPatch = useCallback((id: string, dir: 'up' | 'down') => {
    if (!activeDoc) return
    setDocs((prev) =>
      prev.map((d) => {
        if (d.id !== activeDoc.id) return d
        const idx = d.acceptedPatches.findIndex((p) => p.id === id)
        if (idx < 0) return d
        const next = [...d.acceptedPatches]
        const swapWith = dir === 'up' ? idx - 1 : idx + 1
        if (swapWith < 0 || swapWith >= next.length) return d
        ;[next[idx], next[swapWith]] = [next[swapWith], next[idx]]
        return { ...d, acceptedPatches: next }
      }),
    )
  }, [activeDoc])

  const onExport = useCallback(async () => {
    if (!activeDoc || activeDoc.acceptedPatches.length === 0) return
    setDocs((prev) =>
      prev.map((d) =>
        d.id === activeDoc.id ? { ...d, exportLoading: true, exportError: null } : d,
      ),
    )
    try {
      const blob = await postExportPdf(
        activeDoc.file,
        activeDoc.acceptedPatches,
        exportMode as ApiExportMode,
      )
      downloadBlob(blob, `patched-${activeDoc.name}`)
    } catch (e) {
      setDocs((prev) =>
        prev.map((d) =>
          d.id === activeDoc.id
            ? { ...d, exportError: e instanceof Error ? e.message : 'Export failed' }
            : d,
        ),
      )
    } finally {
      setDocs((prev) =>
        prev.map((d) =>
          d.id === activeDoc.id ? { ...d, exportLoading: false } : d,
        ),
      )
    }
  }, [activeDoc, exportMode])

  const onGenerateDocumentPlan = useCallback(async () => {
    if (!activeDoc) return
    if (!activeDoc.instruction.trim()) {
      setDocs((prev) =>
        prev.map((d) =>
          d.id === activeDoc.id
            ? { ...d, planError: 'Add an instruction to generate a document plan.' }
            : d,
        ),
      )
      return
    }
    setDocs((prev) =>
      prev.map((d) =>
        d.id === activeDoc.id ? { ...d, planLoading: true, planError: null, planEdits: null } : d,
      ),
    )
    try {
      const { edits } = await postPlanPdf(activeDoc.file, activeDoc.instruction)
      setDocs((prev) =>
        prev.map((d) =>
          d.id === activeDoc.id ? { ...d, planEdits: edits } : d,
        ),
      )
    } catch (e) {
      setDocs((prev) =>
        prev.map((d) =>
          d.id === activeDoc.id
            ? { ...d, planError: e instanceof Error ? e.message : 'Plan failed' }
            : d,
        ),
      )
    } finally {
      setDocs((prev) =>
        prev.map((d) =>
          d.id === activeDoc.id ? { ...d, planLoading: false } : d,
        ),
      )
    }
  }, [activeDoc])

  const onImportResolvedPlan = useCallback(() => {
    if (!activeDoc?.planEdits?.length) return
    const additions: AcceptedPatch[] = activeDoc.planEdits
      .filter((e) => e.bbox && e.bbox.length === 4 && !e.error)
      .map((e) => ({
        id: crypto.randomUUID(),
        originalText: e.find,
        replacementText: e.replace,
        instruction: activeDoc.instruction,
        page: e.page,
        bbox: e.bbox as BBox,
      }))
    if (additions.length === 0) return
    setDocs((prev) =>
      prev.map((d) =>
        d.id === activeDoc.id
          ? { ...d, acceptedPatches: [...d.acceptedPatches, ...additions] }
          : d,
      ),
    )
  }, [activeDoc])

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-left">
          <div className="brand">PatchPDF</div>
          <nav className="tabs" aria-label="Documents">
            {docs.map((d) => (
              <button
                key={d.id}
                type="button"
                className={`tab${d.id === activeDocId ? ' is-active' : ''}`}
                onClick={() => setActiveDocId(d.id)}
              >
                {d.name}
              </button>
            ))}
          </nav>
        </div>
        <div className="topbar-right">
          <label className="file-label">
            <span className="file-button">Open PDF</span>
            <input
              type="file"
              accept="application/pdf"
              className="sr-only"
              onChange={(e) => onFile(e.target.files?.[0])}
            />
          </label>
        </div>
      </header>
      <div className="workspace">
        <main ref={viewerPaneRef} className="viewer-pane">
          {activeDoc && activeDoc.numPages > 1 ? (
            <div className="pdf-page-toolbar">
              <button
                type="button"
                className="page-nav-button"
                onClick={() => goPage(activeDoc.viewerPage - 1)}
                disabled={activeDoc.viewerPage <= 1}
              >
                Previous page
              </button>
              <span className="page-indicator">
                Page {activeDoc.viewerPage} of {activeDoc.numPages}
              </span>
              <label className="page-jump">
                <span className="sr-only">Go to page</span>
                <input
                  className="page-jump-input"
                  type="number"
                  min={1}
                  max={activeDoc.numPages}
                  value={activeDoc.viewerPage}
                  onChange={(e) => {
                    const n = Number(e.target.value)
                    if (Number.isFinite(n)) jumpToPage(n)
                  }}
                />
              </label>
              <button
                type="button"
                className="page-nav-button"
                onClick={() => goPage(activeDoc.viewerPage + 1)}
                disabled={activeDoc.viewerPage >= activeDoc.numPages}
              >
                Next page
              </button>
            </div>
          ) : null}
          <PdfViewer
            data={activeDoc?.data ?? null}
            pageNumber={activeDoc?.viewerPage ?? 1}
            onNumPages={onNumPages}
            onSelectionChange={handleSelectionChange}
          />
        </main>
        <SelectionPanel
          ref={selectionPanelRef}
          selectedText={activeDoc?.selection.text ?? ''}
          instruction={activeDoc?.instruction ?? ''}
          onInstructionChange={(v) => {
            if (!activeDoc) return
            setDocs((prev) =>
              prev.map((d) => (d.id === activeDoc.id ? { ...d, instruction: v } : d)),
            )
          }}
          onRewrite={onRewrite}
          onRegenerateProposal={onRegenerateProposal}
          rewriteLoading={activeDoc?.rewriteLoading ?? false}
          rewriteError={activeDoc?.rewriteError ?? null}
          proposal={activeDoc?.proposal ?? null}
          onAcceptProposal={onAcceptProposal}
          onRejectProposal={onRejectProposal}
          onClearSelection={() => {
            if (!activeDoc) return
            viewerMayClearSelectionRef.current = false
            setDocs((prev) =>
              prev.map((d) =>
                d.id === activeDoc.id
                  ? { ...d, selection: { text: '', page: d.viewerPage, bbox: null }, proposal: null }
                  : d,
              ),
            )
          }}
          acceptedPatches={activeDoc?.acceptedPatches ?? []}
          onRemoveAcceptedPatch={onRemoveAcceptedPatch}
          onMoveAcceptedPatch={onMoveAcceptedPatch}
          canExport={Boolean(activeDoc) && (activeDoc?.acceptedPatches.length ?? 0) > 0}
          exportLoading={activeDoc?.exportLoading ?? false}
          exportError={activeDoc?.exportError ?? null}
          onExport={onExport}
          exportMode={exportMode}
          onExportModeChange={setExportMode}
          planEdits={activeDoc?.planEdits ?? null}
          planLoading={activeDoc?.planLoading ?? false}
          planError={activeDoc?.planError ?? null}
          onGenerateDocumentPlan={onGenerateDocumentPlan}
          onImportResolvedPlan={onImportResolvedPlan}
          hasPdfFile={Boolean(activeDoc)}
        />
      </div>
    </div>
  )
}
