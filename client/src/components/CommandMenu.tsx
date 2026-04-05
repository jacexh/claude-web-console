import { cn } from "@/lib/utils"
import { useEffect, useRef } from "react"

export interface SlashCommand {
  name: string
  description: string
  isSkill?: boolean
}

/** Static fallback commands (shown when no dynamic list is available) */
const BUILTIN_COMMANDS: SlashCommand[] = [
  { name: "/help", description: "Show available commands" },
  { name: "/clear", description: "Clear conversation history" },
  { name: "/compact", description: "Compact conversation context" },
  { name: "/context", description: "Show context usage breakdown" },
  { name: "/cost", description: "Show token usage and cost" },
  { name: "/model", description: "Switch model" },
  { name: "/resume", description: "Resume previous conversation" },
  { name: "/commit", description: "Create a git commit" },
  { name: "/review", description: "Review code changes" },
  { name: "/init", description: "Initialize CLAUDE.md" },
  { name: "/permissions", description: "View permission settings" },
  { name: "/status", description: "Show session status" },
  { name: "/doctor", description: "Check installation health" },
  { name: "/login", description: "Sign in to Anthropic" },
  { name: "/logout", description: "Sign out" },
  { name: "/exit", description: "Exit current session" },
  { name: "/fast", description: "Toggle fast mode" },
  { name: "/vim", description: "Toggle vim mode" },
  { name: "/bug", description: "Report a bug" },
  { name: "/terminal-setup", description: "Configure terminal theme" },
  { name: "/plugin", description: "Manage plugins" },
  { name: "/mcp", description: "Manage MCP servers" },
  { name: "/agents", description: "Show custom agents" },
  { name: "/memory", description: "Show memory files" },
  { name: "/skills", description: "Show available skills" },
]

interface CommandMenuProps {
  commands: SlashCommand[]
  selectedIndex: number
  onSelect: (command: string) => void
}

export function filterCommands(
  input: string,
  dynamicCommands?: { name: string; description: string }[],
): SlashCommand[] {
  if (!input.startsWith("/")) return []
  const query = input.slice(1).toLowerCase()

  // Use dynamic list from SDK if available, otherwise fallback to builtins
  let commands: SlashCommand[]
  if (dynamicCommands && dynamicCommands.length > 0) {
    commands = dynamicCommands.map((c) => ({
      name: c.name.startsWith("/") ? c.name : `/${c.name}`,
      description: c.description,
      isSkill: c.name.includes(":"),
    }))
  } else {
    commands = BUILTIN_COMMANDS
  }

  if (!query) return commands.slice(0, 30)
  return commands.filter((cmd) => {
    const name = cmd.name.slice(1).toLowerCase()
    return name.includes(query)
  })
}

export function CommandMenu({ commands, selectedIndex, onSelect }: CommandMenuProps) {
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const active = listRef.current?.querySelector("[data-active=true]")
    active?.scrollIntoView({ block: "nearest" })
  }, [selectedIndex])

  if (commands.length === 0) return null

  return (
    <div
      ref={listRef}
      className="absolute bottom-full left-0 right-0 mb-1 max-h-[320px] overflow-auto rounded-xl bg-white border border-slate-200 shadow-float"
    >
      {commands.map((cmd, i) => (
        <div
          key={cmd.name}
          data-active={i === selectedIndex}
          onMouseDown={(e) => {
            e.preventDefault()
            onSelect(cmd.name)
          }}
          className={cn(
            "flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-colors",
            i === selectedIndex ? "bg-slate-100" : "hover:bg-slate-50"
          )}
        >
          <span className="font-mono text-sm font-semibold text-primary shrink-0">{cmd.name}</span>
          <span className="text-sm text-muted-foreground truncate min-w-0">
            {cmd.description.length > 80 ? cmd.description.slice(0, 80) + '…' : cmd.description}
          </span>
          {cmd.isSkill && (
            <span className="ml-auto text-[10px] text-primary/40 bg-primary-container/20 rounded px-1.5 py-0.5 shrink-0">skill</span>
          )}
        </div>
      ))}
    </div>
  )
}
