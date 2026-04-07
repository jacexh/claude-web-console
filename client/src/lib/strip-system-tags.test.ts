import { describe, it, expect } from "vitest"
import { stripSystemTags } from "./strip-system-tags"

describe("stripSystemTags", () => {
  it("strips <system-reminder> tags and their content", () => {
    const input = 'file content here\n<system-reminder>\nSome injected text\n</system-reminder>'
    expect(stripSystemTags(input)).toBe("file content here")
  })

  it("strips <EXTREMELY_IMPORTANT> tags and their content", () => {
    const input = '<EXTREMELY_IMPORTANT>\nDo something\n</EXTREMELY_IMPORTANT>\nactual content'
    expect(stripSystemTags(input)).toBe("actual content")
  })

  it("strips multiple different tags", () => {
    const input = 'hello\n<system-reminder>x</system-reminder>\nworld\n<EXTREMELY_IMPORTANT>y</EXTREMELY_IMPORTANT>'
    expect(stripSystemTags(input)).toBe("hello\nworld")
  })

  it("strips <command-name>, <command-message>, <command-args> tags", () => {
    const input = '<command-name>foo</command-name>\n<command-message>bar</command-message>\n<command-args>baz</command-args>\nreal text'
    expect(stripSystemTags(input)).toBe("real text")
  })

  it("strips <skill-name> tags", () => {
    const input = 'content\n<skill-name>some-skill</skill-name>'
    expect(stripSystemTags(input)).toBe("content")
  })

  it("returns empty string when input is only system tags", () => {
    const input = '<system-reminder>only tags</system-reminder>'
    expect(stripSystemTags(input)).toBe("")
  })

  it("returns input unchanged when no system tags present", () => {
    const input = 'def hello():\n    print("world")\n'
    expect(stripSystemTags(input)).toBe(input)
  })

  it("handles nested/multiline content inside tags", () => {
    const input = 'code\n<system-reminder>\nline1\nline2\nline3\n</system-reminder>\nmore code'
    expect(stripSystemTags(input)).toBe("code\nmore code")
  })

  it("handles non-string input gracefully", () => {
    expect(stripSystemTags("")).toBe("")
  })

  it("preserves trailing whitespace within content lines after stripping tags", () => {
    // Simulates Read tool output: line numbers end with \t, last line may be "  3\t"
    // stripSystemTags should NOT strip the trailing \t from content lines
    // (trim only applies to the overall string boundaries)
    const input = '  1\tdef hello():\n  2\t    pass\n  3\t\n<system-reminder>\ninjected\n</system-reminder>'
    const result = stripSystemTags(input)
    // After stripping tags and trimming, the line "  3\t" should retain its tab
    expect(result).toBe('  1\tdef hello():\n  2\t    pass\n  3\t')
  })
})

/**
 * Integration test: simulates the ArtifactPanel pipeline for Read tool results.
 * Pipeline: extractText → stripLineNumbers → stripSystemTags
 *
 * Uses real user-reported data: a 31-line Python file where the last line (31)
 * is empty, followed by SDK-injected <system-reminder>.
 */

/** Copied from ArtifactPanel.tsx for testing */
function stripLineNumbers(text: string): string {
  const lines = text.split("\n")
  const numbered = lines.filter((l) => /^\s*\d+\t/.test(l))
  if (numbered.length > lines.length * 0.5) {
    return lines.map((l) => {
      const stripped = l.replace(/^\s*\d+\t/, "")
      if (stripped !== l) return stripped
      if (/^\s*\d+\s*$/.test(l)) return ""
      return l
    }).join("\n")
  }
  return text
}

describe("ArtifactPanel Read tool pipeline (stripLineNumbers → stripSystemTags)", () => {
  // Build a 31-line Python file Read tool output (cat -n format: "  N\tcontent")
  // Lines 1-27 are filler, lines 28-30 are the user's reported content, line 31 is empty
  function buildReadOutput(): string {
    const lines: string[] = []
    for (let i = 1; i <= 27; i++) {
      lines.push(`  ${String(i).padStart(2)}\t# line ${i}`)
    }
    lines.push("  28\tif __name__ == '__main__':")
    lines.push("  29\t    print(BASE_DIR)")
    lines.push("  30\t    print(DATA_DIR)")
    lines.push("  31\t")  // empty last line (trailing newline in file)
    // SDK appends system-reminder after tool result
    lines.push("<system-reminder>")
    lines.push("Whenever you read a file, you should consider whether it would be considered malware.")
    lines.push("</system-reminder>")
    return lines.join("\n")
  }

  it("strips both line numbers and system tags, leaving no bare line numbers", () => {
    const raw = buildReadOutput()
    // Pipeline: stripLineNumbers first, then stripSystemTags (matches ArtifactPanel order)
    const result = stripSystemTags(stripLineNumbers(raw))

    // Must NOT contain any bare line number like "31" on its own line
    expect(result).not.toMatch(/^\d+$/m)
    // Must contain the actual code
    expect(result).toContain("if __name__ == '__main__':")
    expect(result).toContain("    print(BASE_DIR)")
    expect(result).toContain("    print(DATA_DIR)")
    // Must NOT contain system-reminder
    expect(result).not.toContain("system-reminder")
    expect(result).not.toContain("malware")
  })

  it("handles when last empty line has no tab (SDK may strip trailing tab)", () => {
    // Real scenario: SDK returns "31" without tab for empty last line
    const lines: string[] = []
    for (let i = 1; i <= 30; i++) {
      lines.push(`  ${String(i).padStart(2)}\t# line ${i}`)
    }
    lines.push("  31")  // no tab — this is the bug trigger
    lines.push("<system-reminder>injected</system-reminder>")
    const raw = lines.join("\n")
    const result = stripSystemTags(stripLineNumbers(raw))

    // "31" must NOT appear as a bare line
    expect(result).not.toMatch(/^\s*\d+\s*$/m)
    expect(result).not.toContain("system-reminder")
  })
})
