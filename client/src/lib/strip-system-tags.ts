/**
 * Extract and separate SDK-injected XML tags from text content.
 *
 * The Claude SDK appends system tags (e.g. <system-reminder>) to tool results
 * and user messages. These should be separated from content and rendered distinctly.
 */

const SYSTEM_TAG_PATTERN = /<(system-reminder|EXTREMELY_IMPORTANT|skill-name|command-name|command-message|command-args)>([\s\S]*?)<\/\1>/g
const RESULT_ID_PATTERN = /\[result-id: \w+\]\s*$/gm

export interface StripResult {
  content: string
  systemTags: string[]
}

/** Extract system tags from text, returning clean content and extracted tag contents */
export function extractSystemTags(text: string): StripResult {
  if (!text) return { content: text, systemTags: [] }
  const systemTags: string[] = []
  const content = text.replace(SYSTEM_TAG_PATTERN, (_match, _tag, inner) => {
    const trimmed = (inner as string).trim()
    if (trimmed) systemTags.push(trimmed)
    return ""
  }).replace(RESULT_ID_PATTERN, '')
  return { content, systemTags }
}

/** Convenience: strip system tags and return only content (for contexts where tags are discarded) */
export function stripSystemTags(text: string): string {
  return extractSystemTags(text).content
}
