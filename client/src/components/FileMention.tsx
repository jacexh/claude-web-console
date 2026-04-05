import { cn } from "@/lib/utils"
import { useEffect, useRef } from "react"
import { Folder, FileText } from "lucide-react"

export interface FileEntry {
  name: string
  path: string
  isDir: boolean
}

interface FileMentionProps {
  files: FileEntry[]
  selectedIndex: number
  onSelect: (path: string) => void
}

export function FileMention({ files, selectedIndex, onSelect }: FileMentionProps) {
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const active = listRef.current?.querySelector("[data-active=true]")
    active?.scrollIntoView({ block: "nearest" })
  }, [selectedIndex])

  if (files.length === 0) return null

  return (
    <div
      ref={listRef}
      className="absolute bottom-full left-0 right-0 mb-1 max-h-[280px] overflow-auto rounded-xl glass shadow-ambient"
    >
      {files.map((file, i) => (
        <div
          key={file.path}
          data-active={i === selectedIndex}
          onMouseDown={(e) => {
            e.preventDefault()
            onSelect(file.path)
          }}
          className={cn(
            "flex items-center gap-2.5 px-4 py-2.5 cursor-pointer transition-colors",
            i === selectedIndex ? "bg-surface-high/60" : "hover:bg-surface-high/30"
          )}
        >
          {file.isDir ? (
            <Folder className="h-3.5 w-3.5 text-primary shrink-0" />
          ) : (
            <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          )}
          <span className="font-mono text-sm text-foreground truncate">{file.path}</span>
        </div>
      ))}
    </div>
  )
}
