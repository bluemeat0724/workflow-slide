import type { WorkflowAgentMessage, WorkflowAgentProposal, WorkflowAgentState } from '../../api/contracts'
import { useEffect, useRef, type KeyboardEvent } from 'react'
import type { Messages } from '../../i18n'
import { WorkflowChatMessageList } from './WorkflowChatMessageList'

type WorkflowAgentWindowProps = {
  messages: Messages
  isOpen: boolean
  sessionReady: boolean
  agentMessages: WorkflowAgentMessage[]
  agentInput: string
  agentState: WorkflowAgentState
  agentProposal: WorkflowAgentProposal | null
  isAgentLoading: boolean
  isAgentExecuting: boolean
  agentError: string
  onClose: () => void
  onInputChange: (value: string) => void
  onSend: () => void
  onExecute: () => void
  onBackdropClick: () => void
}

export function WorkflowAgentWindow({
  messages,
  isOpen,
  sessionReady,
  agentMessages,
  agentInput,
  agentState,
  agentProposal,
  isAgentLoading,
  isAgentExecuting,
  agentError,
  onClose,
  onInputChange,
  onSend,
  onExecute,
  onBackdropClick,
}: WorkflowAgentWindowProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const isBusy = isAgentLoading || isAgentExecuting
  const canExecute = agentState === 'awaiting_execution_confirmation' && Boolean(agentProposal) && !isBusy
  const isEmptyState = agentMessages.length === 0 && !agentProposal && !agentError

  useEffect(() => {
    if (!isOpen || !sessionReady || isBusy) {
      return
    }

    textareaRef.current?.focus()
  }, [isBusy, isOpen, sessionReady])

  if (!isOpen) {
    return null
  }

  function handleTextareaKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== 'Enter' || event.shiftKey) {
      return
    }

    if (event.metaKey || event.ctrlKey) {
      event.preventDefault()
      onSend()
      return
    }

    if (canExecute) {
      event.preventDefault()
      onExecute()
    }
  }

  return (
    <div className="workflow-agent-backdrop" onClick={onBackdropClick}>
      <section
        className={`workflow-agent-window${isEmptyState ? ' workflow-agent-window--empty' : ''}`}
        aria-label={messages.agent.title}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="workflow-agent-window__header">
          <div>
            <p className="workflow-agent-window__eyebrow">{messages.agent.badge}</p>
            <h2>{messages.agent.title}</h2>
            <p>{messages.agent.stateLabels[agentState]}</p>
          </div>
          <button
            type="button"
            className="workflow-agent-window__close"
            onClick={onClose}
          >
            {messages.agent.close}
          </button>
        </header>

        {agentProposal ? (
          <section className="workflow-agent-window__proposal">
            <strong>{agentProposal.title}</strong>
            <p>{agentProposal.summary}</p>
          </section>
        ) : null}

        <WorkflowChatMessageList
          messages={agentMessages}
          emptyLabel={sessionReady ? messages.agent.empty : messages.agent.connecting}
          roleLabels={messages.agent.roleLabels}
        />

        {agentError ? <p className="workflow-agent-window__error">{agentError}</p> : null}

        <div className={`workflow-agent-window__composer${isEmptyState ? ' workflow-agent-window__composer--empty' : ''}`}>
          <textarea
            ref={textareaRef}
            value={agentInput}
            onChange={(event) => onInputChange(event.target.value)}
            onKeyDown={handleTextareaKeyDown}
            placeholder={messages.agent.inputPlaceholder}
            title={messages.agent.inputHint}
            disabled={!sessionReady || isBusy}
            rows={5}
          />
          <div className={`workflow-agent-window__actions${isEmptyState ? ' workflow-agent-window__actions--empty' : ''}`}>
            <button
              type="button"
              className="workflow-agent-window__button workflow-agent-window__button--ghost"
              onMouseDown={(event) => event.preventDefault()}
              onClick={onSend}
              disabled={!sessionReady || isBusy || !agentInput.trim()}
              title={messages.agent.sendHint}
              aria-label={messages.agent.sendHint}
            >
              {isAgentLoading ? messages.agent.sending : messages.agent.send}
            </button>
            <button
              type="button"
              className="workflow-agent-window__button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={onExecute}
              disabled={!canExecute}
              title={messages.agent.executeHint}
              aria-label={messages.agent.executeHint}
            >
              {isAgentExecuting ? messages.agent.executing : messages.agent.execute}
            </button>
          </div>
        </div>
      </section>
    </div>
  )
}
