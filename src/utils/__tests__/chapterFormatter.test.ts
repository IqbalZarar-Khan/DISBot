/**
 * Unit tests for chapterFormatter.ts — the spoiler/chapter formatting used
 * in post announcement embeds.
 */
import { detectChapter, formatSerialContent } from '../chapterFormatter';

// ── detectChapter ─────────────────────────────────────────────────────────────

describe('detectChapter', () => {
    it.each([
        ['Chapter 12', 12, 'Chapter 12'],
        ['My Story — Chapter 7: The Fall', 7, 'Chapter 7'],
        ['Ch. 3', 3, 'Ch. 3'],
        ['Ch 9', 9, 'Ch 9'],
        ['Part 2', 2, 'Part 2'],
        ['Episode 44', 44, 'Episode 44'],
        ['Ep. 5', 5, 'Ep. 5'],
        ['Volume 2', 2, 'Volume 2'],
        ['Vol. 8', 8, 'Vol. 8'],
        ['Issue #13', 13, 'Issue #13'],
    ])('detects "%s"', (title, expectedNumber, expectedLabel) => {
        const info = detectChapter(title);
        expect(info).not.toBeNull();
        expect(info!.chapterNumber).toBe(expectedNumber);
        expect(info!.chapterLabel).toBe(expectedLabel);
        expect(info!.isSerialContent).toBe(true);
    });

    it('is case-insensitive', () => {
        expect(detectChapter('chapter 4')?.chapterNumber).toBe(4);
        expect(detectChapter('PART 2')?.chapterNumber).toBe(2);
    });

    it('returns null for non-serial titles', () => {
        expect(detectChapter('Just a normal announcement')).toBeNull();
        expect(detectChapter('Art dump')).toBeNull();
        expect(detectChapter('')).toBeNull();
    });

    it('prefers the first matching pattern', () => {
        // "Chapter" pattern is checked before "Part"
        expect(detectChapter('Chapter 1: Part 2 begins')?.chapterLabel).toBe('Chapter 1');
    });
});

// ── formatSerialContent ───────────────────────────────────────────────────────

describe('formatSerialContent', () => {
    const chapterInfo = { chapterNumber: 12, chapterLabel: 'Chapter 12', isSerialContent: true };

    it('prefixes the title with the book emoji and adds a chapter badge', () => {
        const { formattedTitle, formattedDescription } = formatSerialContent(
            'My Story Chapter 12',
            undefined,
            chapterInfo
        );

        expect(formattedTitle).toBe('📖 My Story Chapter 12');
        expect(formattedDescription).toContain('**Chapter 12** is out!');
    });

    it('wraps the synopsis in Discord spoiler tags', () => {
        const { formattedDescription } = formatSerialContent(
            'My Story Chapter 12',
            'The protagonist finally reveals the secret.',
            chapterInfo
        );

        expect(formattedDescription).toContain('📝 **Synopsis (spoiler):**');
        expect(formattedDescription).toContain('||The protagonist finally reveals the secret.||');
    });

    it('truncates snippets longer than 200 characters and appends ellipsis', () => {
        const longSnippet = 'a'.repeat(250);
        const { formattedDescription } = formatSerialContent('T', longSnippet, chapterInfo);

        const spoilerContent = formattedDescription.match(/\|\|(.+?)\.\.\.\|\|/);
        expect(spoilerContent).not.toBeNull();
        expect(spoilerContent![1].length).toBe(200);
    });

    it('flattens newlines in the snippet', () => {
        const { formattedDescription } = formatSerialContent(
            'T',
            'line one\nline two',
            chapterInfo
        );

        expect(formattedDescription).toContain('||line one line two||');
    });

    it('marks chapter 1 as the start of a new series', () => {
        const first = formatSerialContent('T', undefined, {
            chapterNumber: 1,
            chapterLabel: 'Chapter 1',
            isSerialContent: true,
        });
        expect(first.formattedDescription).toContain('This is the beginning of a new series!');

        const later = formatSerialContent('T', undefined, chapterInfo);
        expect(later.formattedDescription).toContain('This is Chapter 12 in the series.');
    });

    it('omits the synopsis section when no snippet is provided', () => {
        const { formattedDescription } = formatSerialContent('T', undefined, chapterInfo);
        expect(formattedDescription).not.toContain('Synopsis');
    });
});
