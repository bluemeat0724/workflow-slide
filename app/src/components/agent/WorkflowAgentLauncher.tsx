import type { MouseEvent } from 'react'

type WorkflowAgentLauncherProps = {
  label: string
  isOpen: boolean
  position: {
    x: number
    y: number
  }
  disabled?: boolean
  onClick: () => void
  onMouseDown: (event: MouseEvent<HTMLButtonElement>) => void
}

export function WorkflowAgentLauncher({
  label,
  isOpen,
  position,
  disabled = false,
  onClick,
  onMouseDown,
}: WorkflowAgentLauncherProps) {
  return (
    <button
      type="button"
      className={`workflow-agent-launcher${isOpen ? ' is-open' : ''}`}
      onClick={onClick}
      onMouseDown={onMouseDown}
      disabled={disabled}
      aria-pressed={isOpen}
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
      }}
    >
      <span className="workflow-agent-launcher__pulse" aria-hidden="true" />
      <span className="workflow-agent-launcher__label">{label}</span>
    </button>
  )
}
