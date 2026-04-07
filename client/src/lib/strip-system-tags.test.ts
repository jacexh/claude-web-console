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
})
