import { useCallback, useState } from 'react'
import { PdfViewer } from './components/PdfViewer'
import { SelectionPanel } from './components/SelectionPanel'

export default function App() {
  const [pdfData, setPdfData] = useState<ArrayBuffer | null>(null)
  const [selectedText, setSelectedText] = useState('')

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
        <SelectionPanel selectedText={selectedText} />
      </div>
    </div>
  )
}
