/**
 * Citation metadata for the deterministic citation pipeline.
 *
 * Provides structured identifiers that the platform entity linker
 * uses to match references in agent responses to MCP tool results.
 *
 * See: docs/plans/2026-04-07-deterministic-citation-pipeline-design.md
 */

export interface CitationMetadata {
  canonical_ref: string;
  display_text: string;
  aliases?: string[];
  source_url?: string;
  lookup: {
    tool: string;
    args: Record<string, string>;
  };
}

/**
 * Build citation metadata for a tool response.
 *
 * @param canonicalRef  Primary reference the entity linker matches against
 * @param displayText   How the reference appears in prose
 * @param toolName      The MCP tool name (e.g. "get_pest_details")
 * @param toolArgs      The tool arguments for verification lookup
 * @param sourceUrl     Official portal URL (optional)
 * @param aliases       Alternative names (optional)
 */
export function buildCitation(
  canonicalRef: string,
  displayText: string,
  toolName: string,
  toolArgs: Record<string, string>,
  sourceUrl?: string | null,
  aliases?: string[],
): CitationMetadata {
  return {
    canonical_ref: canonicalRef,
    display_text: displayText,
    ...(aliases && aliases.length > 0 && { aliases }),
    ...(sourceUrl && { source_url: sourceUrl }),
    lookup: {
      tool: toolName,
      args: toolArgs,
    },
  };
}
