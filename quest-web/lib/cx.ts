/** Joins class names, skipping empty ones, so there are never stray spaces. */
export const cx = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(" ");
