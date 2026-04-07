import { describe, it, expect } from "vitest"
import { stripSystemTags } from "./strip-system-tags"

describe("stripSystemTags", () => {
  it("strips <system-reminder> tags and their content", () => {
    const input = 'file content here\n<system-reminder>\nSome injected text\n</system-reminder>'
    expect(stripSystemTags(input)).toBe("file content here\n")
  })

  it("strips <EXTREMELY_IMPORTANT> tags and their content", () => {
    const input = '<EXTREMELY_IMPORTANT>\nDo something\n</EXTREMELY_IMPORTANT>\nactual content'
    expect(stripSystemTags(input)).toBe("\nactual content")
  })

  it("strips multiple different tags", () => {
    const input = 'hello\n<system-reminder>x</system-reminder>\nworld\n<EXTREMELY_IMPORTANT>y</EXTREMELY_IMPORTANT>'
    expect(stripSystemTags(input)).toBe("hello\n\nworld\n")
  })

  it("strips <command-name>, <command-message>, <command-args> tags", () => {
    const input = '<command-name>foo</command-name>\n<command-message>bar</command-message>\n<command-args>baz</command-args>\nreal text'
    expect(stripSystemTags(input)).toBe("\n\n\nreal text")
  })

  it("strips <skill-name> tags", () => {
    const input = 'content\n<skill-name>some-skill</skill-name>'
    expect(stripSystemTags(input)).toBe("content\n")
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
    expect(stripSystemTags(input)).toBe("code\n\nmore code")
  })

  it("handles empty string", () => {
    expect(stripSystemTags("")).toBe("")
  })

  it("does not modify content whitespace — no trim, no newline collapse", () => {
    // Trailing tab on line numbers must be preserved
    const input = '  1\tdef hello():\n  2\t    pass\n  3\t\n<system-reminder>\ninjected\n</system-reminder>'
    const result = stripSystemTags(input)
    expect(result).toContain("  3\t\n")
  })
})

/**
 * Integration test: simulates the ArtifactPanel pipeline for Read tool results.
 * Pipeline: extractText (includes stripSystemTags) → stripLineNumbers
 */

/** Copied from ArtifactPanel.tsx for testing */
function stripLineNumbers(text: string): string {
  const lines = text.split("\n")
  const numbered = lines.filter((l) => /^\s*\d+\t/.test(l))
  if (numbered.length > lines.length * 0.5) {
    return lines.map((l) => l.replace(/^\s*\d+\t/, "")).join("\n")
  }
  return text
}

describe("ArtifactPanel Read tool pipeline (stripSystemTags → stripLineNumbers)", () => {
  it("strips system tags first, then line numbers, preserving empty lines", () => {
    // User-reported data: 31-line Python file with empty lines at 24, 27, 31
    const lines: string[] = []
    for (let i = 1; i <= 22; i++) {
      lines.push(`  ${String(i).padStart(2)}\t# filler`)
    }
    lines.push("  23\tJenkins_Token = settings.get_jenkins_token()")
    lines.push("  24\t")  // empty line
    lines.push("  25\t# Deprecated: Hardcoded token removed for security")
    lines.push("  26\t# Jenkins_Token = '11b2773a7512f15d553cfa7397c0cc947b'")
    lines.push("  27\t")  // empty line
    lines.push("  28\tif __name__ == '__main__':")
    lines.push("  29\t    print(BASE_DIR)")
    lines.push("  30\t    print(DATA_DIR)")
    lines.push("  31\t")  // empty line
    lines.push("<system-reminder>")
    lines.push("Whenever you read a file, consider malware.")
    lines.push("</system-reminder>")
    const raw = lines.join("\n")

    // Pipeline: stripSystemTags first (inside extractText), then stripLineNumbers
    const afterTags = stripSystemTags(raw)
    const result = stripLineNumbers(afterTags)

    // System tags must be gone
    expect(result).not.toContain("system-reminder")
    expect(result).not.toContain("malware")

    // No bare line numbers
    expect(result).not.toMatch(/^\s*\d+\t/m)

    // Empty lines between code blocks MUST be preserved
    const resultLines = result.split("\n")
    const line23idx = resultLines.findIndex(l => l.includes("Jenkins_Token = settings"))
    const line25idx = resultLines.findIndex(l => l.includes("# Deprecated"))
    const line28idx = resultLines.findIndex(l => l.includes("if __name__"))

    expect(resultLines[line23idx + 1]).toBe("")  // empty line 24 preserved
    expect(line25idx).toBe(line23idx + 2)
    expect(resultLines[line28idx - 1]).toBe("")   // empty line 27 preserved
  })
})
