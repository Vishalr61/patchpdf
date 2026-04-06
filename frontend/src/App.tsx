import { useCallback, useEffect, useState } from 'react'
import { postRewrite } from './api/rewrite'
import { PdfViewer } from './components/PdfViewer'
import { SelectionPanel } from './components/SelectionPanel'

export default function App() {
  const [pdfData, setPdfData] = useState<ArrayBuffer | null>(null)
  const [selectedText, setSelectedText] = useState('')
  const [instruction, setInstruction] = useState('')
  const [replacementText, setReplacementText] = useState<string | null>(null)
  const [rewriteLoading, setRewriteLoading] = useState(false)
  const [rewriteError, setRewriteError] = useState<string | null>(null)

  const onFile = useCallback((file: File | undefined) => {
    if (!file || file.type !== 'application/pdf') {
      setPdfData(null)
      return
    }
    void file.arrayBuffer().then(setPdfData)
  }, [])

  const onSelectionChange = useCallback((text: string) => {
    setSelectedText(text)
  }, [])

  useEffect(() => {
    setReplacementText(null)
    setRewriteError(null)
  }, [selectedText])

  const onRewrite = useCallback(async () => {
    const text = selectedText.trim()
    if (!text) return

    setRewriteLoading(true)
    setRewriteError(null)
    setReplacementText(null)

    try {
      const { replacement_text } = await postRewrite(text, instruction)
      setReplacementText(replacement_text)
    } catch (e) {
      setRewriteError(e instanceof Error ? e.message : 'Rewrite failed')
    } finally {
      setRewriteLoading(false)
    }
  }, [selectedText, instruction])

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
          <PdfViewer data={pdfData} onSelectionChange={onSelectionChange} />
        </main>
        <SelectionPanel
          selectedText={selectedText}
          instruction={instruction}
          onInstructionChange={setInstruction}
          onRewrite={onRewrite}
          rewriteLoading={rewriteLoading}
          rewriteError={rewriteError}
          replacementText={replacementText}
        />
      </div>
    </div>
  )
}
