import { useState } from "react"
import { ShieldAlert, CheckCircle, XCircle, AlertTriangle } from "lucide-react"

interface PermissionCardProps {
  toolUseId: string
  toolName: string
  input: Record<string, unknown>
  onDecision: (toolUseId: string, approved: boolean) => void
}

export function PermissionCard({ toolUseId, toolName, input, onDecision }: PermissionCardProps) {
  const [decided, setDecided] = useState<"approved" | "denied" | null>(null)

  const summary = input.file_path
    ? String(input.file_path)
    : input.command
      ? String(input.command).slice(0, 120)
      : JSON.stringify(input).slice(0, 120)

  const handleDecision = (approved: boolean) => {
    setDecided(approved ? "approved" : "denied")
    onDecision(toolUseId, approved)
  }

  if (decided) {
    return (
      <div className="ml-10 my-2 rounded-lg bg-slate-50 border border-slate-200 px-4 py-2.5 flex items-center gap-2">
        {decided === "approved" ? (
          <CheckCircle className="h-3.5 w-3.5 text-success shrink-0" />
        ) : (
          <XCircle className="h-3.5 w-3.5 text-destructive shrink-0" />
        )}
        <span className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{toolName}</span>
          {" — "}
          {decided === "approved" ? "allowed" : "denied"}
        </span>
      </div>
    )
  }

  return (
    <div className="ml-10 my-2">
      <div className="bg-[#fcf1ce] border border-[#f3e4b0] rounded-lg p-4 flex items-center justify-between shadow-soft">
        <div className="flex items-start gap-3 min-w-0">
          <AlertTriangle className="h-5 w-5 text-yellow-600 shrink-0 mt-0.5" />
          <p className="text-sm text-yellow-900 font-medium">
            Permission request to allow access to{" "}
            <span className="font-mono">{toolName}</span>.
          </p>
        </div>
        <div className="flex gap-2 shrink-0 ml-4">
          <button
            onClick={() => handleDecision(true)}
            className="px-4 py-1.5 bg-[#f3e4b0] hover:bg-[#e8d596] text-yellow-900 text-sm font-medium rounded border border-[#e8d596] transition-colors"
          >
            Allow
          </button>
          <button
            onClick={() => handleDecision(false)}
            className="px-4 py-1.5 bg-white hover:bg-slate-50 text-slate-700 text-sm font-medium rounded border border-slate-200 transition-colors"
          >
            Deny
          </button>
        </div>
      </div>
    </div>
  )
}
