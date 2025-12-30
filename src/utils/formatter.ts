/**
 * Format a message template by replacing placeholders with actual values
 * @param template - Message template with placeholders like {tier}, {title}, {url}, {user}
 * @param values - Object mapping placeholder names to their values
 * @returns Formatted message string
 * 
 * @example
 * formatMessage("Welcome {user} to {tier}!", { user: "@John", tier: "Gold" })
 * // Returns: "Welcome @John to Gold!"
 */
export function formatMessage(template: string, values: Record<string, string>): string {
    return template.replace(/{(\w+)}/g, (match, key) => {
        return values[key] || match;
    });
}
