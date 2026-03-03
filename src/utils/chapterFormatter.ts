/**
 * Chapter/serialized content formatter.
 * Detects chapter patterns in post titles and enhances Discord embeds
 * with structured formatting for fanfiction/serial writers.
 */

// Common chapter patterns
const CHAPTER_PATTERNS = [
    /Chapter\s+(\d+)/i,
    /Ch\.?\s*(\d+)/i,
    /Part\s+(\d+)/i,
    /Episode\s+(\d+)/i,
    /Ep\.?\s*(\d+)/i,
    /Vol(?:ume)?\.?\s*(\d+)/i,
    /Issue\s+#?(\d+)/i,
];

export interface ChapterInfo {
    chapterNumber: number;
    chapterLabel: string;  // "Chapter 12", "Part 3", etc.
    isSerialContent: boolean;
}

/**
 * Detect if a post title contains serialized content (chapter, part, episode).
 */
export function detectChapter(title: string): ChapterInfo | null {
    for (const pattern of CHAPTER_PATTERNS) {
        const match = title.match(pattern);
        if (match) {
            return {
                chapterNumber: parseInt(match[1]),
                chapterLabel: match[0],
                isSerialContent: true,
            };
        }
    }
    return null;
}

/**
 * Format a post description for serialized content.
 * Adds spoiler-tagged summary and chapter navigation hints.
 */
export function formatSerialContent(
    title: string,
    snippet: string | undefined,
    chapterInfo: ChapterInfo
): { formattedTitle: string; formattedDescription: string } {
    const formattedTitle = `📖 ${title}`;

    let formattedDescription = '';

    // Add chapter badge
    formattedDescription += `**${chapterInfo.chapterLabel}** is out!\n\n`;

    // Add spoiler-tagged synopsis if available
    if (snippet && snippet.length > 0) {
        const cleanSnippet = snippet.substring(0, 200).replace(/\n/g, ' ').trim();
        formattedDescription += `📝 **Synopsis (spoiler):**\n||${cleanSnippet}${snippet.length > 200 ? '...' : ''}||\n\n`;
    }

    // Add navigation hint
    if (chapterInfo.chapterNumber > 1) {
        formattedDescription += `📚 *This is ${chapterInfo.chapterLabel} in the series.*\n`;
    } else {
        formattedDescription += `📚 *This is the beginning of a new series!*\n`;
    }

    return { formattedTitle, formattedDescription };
}
