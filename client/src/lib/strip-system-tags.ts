/**
 * Strip SDK-injected XML tags from text content.
 *
 * The Claude SDK appends system tags (e.g. <system-reminder>) to tool results
 * and user messages. These should never be visible in the UI.
 */

const SYSTEM_TAG_PATTERN = /<(?:system-reminder|EXTREMELY_IMPORTANT|skill-name|command-name|command-message|command-args)>[\s\S]*?<\/(?:system-reminder|EXTREMELY_IMPORTANT|skill-name|command-name|command-message|command-args)>/g

export function stripSystemTags(text: string): string {
  if (!text) return text
  const replaced = text.replace(SYSTEM_TAG_PATTERN, "")
  if (replaced === text) return text
  return replaced.replace(/\n{2,}/g, "\n").replace(/^\n+|\n+$/g, "")
}
