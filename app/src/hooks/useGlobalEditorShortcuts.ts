import { useEffect } from 'react'
import type { Messages } from '../i18n'
import type { MultiSelection, Selection } from '../model/diagram'
import type { EditorAction } from '../editor/editorState'

type UseGlobalEditorShortcutsInput = {
  dispatch: React.Dispatch<EditorAction>
  selection: Selection
  multiSelection: MultiSelection
  messages: Messages
  setStatus: (status: string) => void
}

export function useGlobalEditorShortcuts({
  dispatch,
  selection,
  multiSelection,
  messages,
  setStatus,
}: UseGlobalEditorShortcutsInput) {
  useEffect(() => {
    function handleDeleteKey(event: KeyboardEvent) {
      if (event.key !== 'Delete' && event.key !== 'Backspace') {
        return
      }

      const target = event.target
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) {
        return
      }

      event.preventDefault()
      if (selection.kind === 'edge') {
        dispatch({ type: 'delete-edge', edgeId: selection.id })
        setStatus(messages.status.edgeDeleted)
        return
      }

      if (multiSelection.nodeIds.length > 0) {
        dispatch({ type: 'delete-selected-nodes', nodeIds: multiSelection.nodeIds })
        setStatus(messages.status.nodesDeleted)
      }
    }

    window.addEventListener('keydown', handleDeleteKey)
    return () => {
      window.removeEventListener('keydown', handleDeleteKey)
    }
  }, [messages.status.edgeDeleted, messages.status.nodesDeleted, multiSelection.nodeIds, selection, dispatch, setStatus])
}
