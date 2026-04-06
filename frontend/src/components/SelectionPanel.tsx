type SelectionPanelProps = {
  selectedText: string
}

export function SelectionPanel({ selectedText }: SelectionPanelProps) {
  const empty = selectedText.length === 0

  return (
    <aside className="selection-panel" aria-label="Selected text">
      <h2 className="selection-panel-title">Selection</h2>
      <p className="selection-panel-hint">
        Highlight text on the page to see it here.
      </p>
      <pre className={`selection-panel-body${empty ? ' is-empty' : ''}`}>
        {empty ? 'No text selected' : selectedText}
      </pre>
    </aside>
  )
}
