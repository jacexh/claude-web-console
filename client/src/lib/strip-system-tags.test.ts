import { describe, it, expect } from "vitest"
import { extractSystemTags, stripSystemTags } from "./strip-system-tags"

describe("extractSystemTags", () => {
  it("extracts <system-reminder> tags and returns both content and tags", () => {
    const input = 'file content here\n<system-reminder>\nSome injected text\n</system-reminder>'
    const result = extractSystemTags(input)
    expect(result.content).toBe("file content here\n")
    expect(result.systemTags).toEqual(["Some injected text"])
  })

  it("extracts multiple different tags", () => {
    const input = 'hello\n<system-reminder>tag1</system-reminder>\nworld\n<EXTREMELY_IMPORTANT>tag2</EXTREMELY_IMPORTANT>'
    const result = extractSystemTags(input)
    expect(result.content).toBe("hello\n\nworld\n")
    expect(result.systemTags).toEqual(["tag1", "tag2"])
  })

  it("returns empty systemTags when no system tags present", () => {
    const input = 'def hello():\n    print("world")\n'
    const result = extractSystemTags(input)
    expect(result.content).toBe(input)
    expect(result.systemTags).toEqual([])
  })

  it("handles empty string", () => {
    const result = extractSystemTags("")
    expect(result.content).toBe("")
    expect(result.systemTags).toEqual([])
  })

  it("skips empty tag contents", () => {
    const input = 'content<system-reminder>  \n  </system-reminder>'
    const result = extractSystemTags(input)
    expect(result.content).toBe("content")
    expect(result.systemTags).toEqual([])
  })

  it("does not modify content whitespace — no trim, no newline collapse", () => {
    const input = '  1\tdef hello():\n  2\t    pass\n  3\t\n<system-reminder>\ninjected\n</system-reminder>'
    const result = extractSystemTags(input)
    expect(result.content).toContain("  3\t\n")
    expect(result.systemTags).toEqual(["injected"])
  })
})

describe("stripSystemTags (convenience wrapper)", () => {
  it("returns only content, discards tags", () => {
    const input = 'content\n<system-reminder>metadata</system-reminder>'
    expect(stripSystemTags(input)).toBe("content\n")
  })

  it("returns input unchanged when no tags", () => {
    const input = 'just code\n'
    expect(stripSystemTags(input)).toBe(input)
  })
})

/**
 * Integration test: simulates the ArtifactPanel pipeline for Read tool results.
 * Pipeline: extractSystemTags (at data entry) → stripLineNumbers (at render)
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

describe("ArtifactPanel Read tool pipeline", () => {
  it("data entry strips system tags, then stripLineNumbers works correctly", () => {
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

    // Step 1: data entry — separate content from system tags
    const { content, systemTags } = extractSystemTags(raw)
    expect(systemTags).toEqual(["Whenever you read a file, consider malware."])

    // Step 2: render — strip line numbers from clean content
    const result = stripLineNumbers(content)

    // No system tags in rendered content
    expect(result).not.toContain("system-reminder")
    expect(result).not.toContain("malware")

    // No bare line numbers
    expect(result).not.toMatch(/^\s*\d+\t/m)

    // Empty lines preserved
    const resultLines = result.split("\n")
    const line23idx = resultLines.findIndex(l => l.includes("Jenkins_Token = settings"))
    const line25idx = resultLines.findIndex(l => l.includes("# Deprecated"))
    const line28idx = resultLines.findIndex(l => l.includes("if __name__"))

    expect(resultLines[line23idx + 1]).toBe("")  // empty line 24
    expect(line25idx).toBe(line23idx + 2)
    expect(resultLines[line28idx - 1]).toBe("")   // empty line 27
  })
})
