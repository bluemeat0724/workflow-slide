import { useEffect, useRef } from 'react'
import type { WorkflowAgentMessage } from '../../api/contracts'

type WorkflowChatMessageListProps = {
  messages: WorkflowAgentMessage[]
  emptyLabel: string
  roleLabels: {
    user: string
    assistant: string
    system: string
  }
}

export function WorkflowChatMessageList({ messages, emptyLabel, roleLabels }: WorkflowChatMessageListProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) {
      return
    }

    container.scrollTop = container.scrollHeight
  }, [messages])

  if (messages.length === 0) {
    return (
      <div
        ref={containerRef}
        className="workflow-agent-window__messages workflow-agent-window__messages--empty"
      >
        <div className="workflow-agent-window__empty">{emptyLabel}</div>
      </div>
    )
  }

  return (
    <div ref={containerRef} className="workflow-agent-window__messages">
      {messages.map((message) => (
        <article
          key={message.id}
          className={`workflow-agent-window__message workflow-agent-window__message--${message.role}`}
        >
          <header>
            <span>{roleLabels[message.role]}</span>
          </header>
          <p>{message.content}</p>
        </article>
      ))}
    </div>
  )
}
