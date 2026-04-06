import { useCallback, useEffect, useState } from 'react'
import { postExportPdf } from './api/export'
import { postRewrite } from './api/rewrite'
import { PdfViewer } from './components/PdfViewer'
import { SelectionPanel } from './components/SelectionPanel'
import type { PageSelectionDetail } from './hooks/usePdfSelection'
import type { AcceptedPatch, RewriteProposal } from './types/patch'

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
    setProposal(null)
    setRewriteError(null)
  }, [selection.text])

  useEffect(() => {
    setAcceptedPatches([])
    setProposal(null)
    setRewriteError(null)
    setExportError(null)
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
    const patch = acceptedPatches[acceptedPatches.length - 1]

    setExportLoading(true)
    setExportError(null)
    try {
      const blob = await postExportPdf(pdfFile, patch)
      downloadBlob(blob, 'patched.pdf')
    } catch (e) {
      setExportError(e instanceof Error ? e.message : 'Export failed')
    } finally {
      setExportLoading(false)
    }
  }, [pdfFile, acceptedPatches])

  return (
    <div className="app">
      <header className="header">
        <h1>PatchPDF</h1>
        <p className="tagline">Upload a PDF to preview page 1</p>
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
        <main className="viewer-pane">
          <PdfViewer data={pdfData} onSelectionChange={setSelection} />
        </main>
        <SelectionPanel
          selectedText={selection.text}
          instruction={instruction}
          onInstructionChange={setInstruction}
          onRewrite={onRewrite}
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
        />
      </div>
    </div>
  )
}
