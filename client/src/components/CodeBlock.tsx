import { memo } from "react"
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter"
import { oneLight } from "react-syntax-highlighter/dist/esm/styles/prism"

interface CodeBlockProps {
  language?: string
  children: string
}

const customStyle: React.CSSProperties = {
  margin: 0,
  padding: "0.875rem 1rem",
  borderRadius: "0.5rem",
  fontSize: "0.8125rem",
  lineHeight: 1.6,
  background: "var(--secondary)",
}

const codeTagProps = { style: { fontFamily: "var(--font-mono)" } }

export const CodeBlock = memo(function CodeBlock({ language, children }: CodeBlockProps) {
  return (
    <SyntaxHighlighter
      style={oneLight}
      language={language || "text"}
      customStyle={customStyle}
      codeTagProps={codeTagProps}
    >
      {children.replace(/\n$/, "")}
    </SyntaxHighlighter>
  )
})

/** Map common file extensions to Prism language identifiers */
export function langFromPath(filePath: string): string | undefined {
  const ext = filePath.split(".").pop()?.toLowerCase()
  const map: Record<string, string> = {
    ts: "typescript", tsx: "tsx", js: "javascript", jsx: "jsx",
    go: "go", py: "python", rs: "rust", rb: "ruby",
    java: "java", kt: "kotlin", cs: "csharp", cpp: "cpp", c: "c", h: "c",
    sh: "bash", zsh: "bash", bash: "bash",
    json: "json", yaml: "yaml", yml: "yaml", toml: "toml",
    md: "markdown", html: "html", css: "css", scss: "scss",
    sql: "sql", graphql: "graphql", proto: "protobuf",
    dockerfile: "docker", makefile: "makefile",
    xml: "xml", svg: "xml",
    diff: "diff", patch: "diff",
  }
  return ext ? map[ext] : undefined
}
