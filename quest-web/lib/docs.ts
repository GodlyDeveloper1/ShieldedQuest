// Documentation pages, written as Markdown in content/docs/ (Privacy comes from
// PRIVACY.md at the app root, so there's a single source of truth).
import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import { marked } from "marked";

export interface DocPage {
  slug: string; // "" for the index
  title: string;
  file: string;
}

export const DOCS: DocPage[] = [
  { slug: "", title: "Getting started", file: "content/docs/index.md" },
  { slug: "how-it-works", title: "How it works", file: "content/docs/how-it-works.md" },
  { slug: "creators", title: "For creators", file: "content/docs/creators.md" },
  { slug: "solvers", title: "For solvers", file: "content/docs/solvers.md" },
  { slug: "privacy", title: "Privacy", file: "PRIVACY.md" },
  { slug: "verify", title: "Verify it yourself", file: "content/docs/verify.md" },
  { slug: "faq", title: "FAQ", file: "content/docs/faq.md" },
  { slug: "pages", title: "Page guide", file: "content/docs/pages.md" },
];

export async function loadDoc(slug: string): Promise<{ page: DocPage; html: string } | null> {
  const page = DOCS.find((d) => d.slug === slug);
  if (!page) return null;
  const md = await fs.readFile(path.join(process.cwd(), page.file), "utf8");
  // Our own files, not user input, so rendering their HTML is safe.
  const html = await marked.parse(md, { gfm: true });
  return { page, html };
}
