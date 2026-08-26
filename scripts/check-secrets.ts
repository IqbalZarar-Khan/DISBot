/**
 * Pre-commit / CI Secrets Scanner
 *
 * Scans codebase files to detect accidentally committed tokens, API keys,
 * or credentials before they are committed to Git history.
 */

import * as fs from 'fs';
import * as path from 'path';

const SECRET_PATTERNS: { name: string; regex: RegExp }[] = [
    {
        name: 'Discord Bot Token',
        regex: /(?:[\w-]{24,26}\.[\w-]{6}\.[\w-]{27,38})/g,
    },
    {
        name: 'Supabase Service Role / Anon JWT Key',
        regex: /eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/g,
    },
    {
        name: 'Patreon Client Secret',
        regex: /(?:PATREON_CLIENT_SECRET\s*=\s*['"]?[a-zA-Z0-9_-]{30,}['"]?)/gi,
    },
];

const IGNORED_DIRS = new Set([
    'node_modules',
    'dist',
    'build',
    '.git',
    'coverage',
    '.gemini',
]);

const IGNORED_FILES = new Set([
    '.env',
    '.env.local',
    '.env.production',
    'package-lock.json',
]);

let violations = 0;

function scanDirectory(dir: string): void {
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
        if (IGNORED_DIRS.has(entry.name)) continue;

        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
            scanDirectory(fullPath);
        } else if (entry.isFile()) {
            if (IGNORED_FILES.has(entry.name) || entry.name.endsWith('.png') || entry.name.endsWith('.jpg')) {
                continue;
            }

            try {
                const content = fs.readFileSync(fullPath, 'utf8');

                for (const pattern of SECRET_PATTERNS) {
                    const matches = content.match(pattern.regex);
                    if (matches) {
                        for (const match of matches) {
                            // Ignore harmless placeholder strings
                            if (match.includes('your_') || match.includes('YOUR_') || match.includes('example') || match.includes('DISCORD_TOKEN')) {
                                continue;
                            }

                            console.error(`🚨 [SECRETS DETECTED] ${pattern.name} in: ${path.relative(process.cwd(), fullPath)}`);
                            console.error(`   → Match preview: ${match.substring(0, 10)}...${match.substring(match.length - 4)}`);
                            violations++;
                        }
                    }
                }
            } catch {
                // Ignore binary read errors
            }
        }
    }
}

console.log('🔍 Scanning repository files for exposed secrets and tokens...');
scanDirectory(process.cwd());

if (violations > 0) {
    console.error(`\n❌ FAILED: Found ${violations} potential secret(s) in repository files.`);
    console.error('   Please remove credentials or add them to .env before committing.');
    process.exit(1);
} else {
    console.log('✅ Secrets scan passed: No exposed credentials found.');
    process.exit(0);
}
