import type { WorkflowAgentMessage } from '../../api/contracts'

type WorkflowChatMessageListProps = {
  messages: WorkflowAgentMessage[]
  emptyLabel: string
}

export function WorkflowChatMessageList({ messages, emptyLabel }: WorkflowChatMessageListProps) {
  if (messages.length === 0) {
    return (
      <div className="workflow-agent-window__messages workflow-agent-window__messages--empty">
        <div className="workflow-agent-window__empty">{emptyLabel}</div>
      </div>
    )
  }

  return (
    <div className="workflow-agent-window__messages">
      {messages.map((message) => (
        <article
          key={message.id}
          className={`workflow-agent-window__message workflow-agent-window__message--${message.role}`}
        >
          <header>
            <span>{message.role === 'assistant' ? 'AI' : 'You'}</span>
          </header>
          <p>{message.content}</p>
        </article>
      ))}
    </div>
  )
}
