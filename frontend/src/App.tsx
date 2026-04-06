import { useCallback, useState } from 'react'
import { PdfViewer } from './components/PdfViewer'

export default function App() {
  const [pdfData, setPdfData] = useState<ArrayBuffer | null>(null)

  const onFile = useCallback((file: File | undefined) => {
    if (!file || file.type !== 'application/pdf') {
      setPdfData(null)
      return
    }
    void file.arrayBuffer().then(setPdfData)
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
      <main className="main">
        <PdfViewer data={pdfData} />
      </main>
    </div>
  )
}
