import { type RefObject, useEffect, useRef } from 'react'

/**
 * Reports the current window selection text when the selection lies inside `rootRef`.
 */
export function useSelectionInRoot(
  rootRef: RefObject<HTMLElement | null>,
  onChange: (text: string) => void,
) {
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  useEffect(() => {
    const readSelection = () => {
      const root = rootRef.current
      const sel = window.getSelection()
      if (!root || !sel || sel.rangeCount === 0) {
        onChangeRef.current('')
        return
      }
      if (sel.isCollapsed) {
        onChangeRef.current('')
        return
      }
      const range = sel.getRangeAt(0)
      if (!root.contains(range.commonAncestorContainer)) {
        onChangeRef.current('')
        return
      }
      const text = sel.toString().replace(/\u00a0/g, ' ')
      onChangeRef.current(text)
    }

    document.addEventListener('selectionchange', readSelection)
    /* Safari often finalizes selection after pointer release; selectionchange alone can lag. */
    document.addEventListener('mouseup', readSelection)
    document.addEventListener('pointerup', readSelection)
    document.addEventListener('touchend', readSelection, { passive: true })

    return () => {
      document.removeEventListener('selectionchange', readSelection)
      document.removeEventListener('mouseup', readSelection)
      document.removeEventListener('pointerup', readSelection)
      document.removeEventListener('touchend', readSelection)
    }
  }, [rootRef])
}
