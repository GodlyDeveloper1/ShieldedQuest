import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DOCS, loadDoc } from "@/lib/docs";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug?: string[] }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const page = DOCS.find((d) => d.slug === (slug?.join("/") ?? ""));
  return { title: page ? `${page.title} · Docs` : "Docs" };
}

export default async function DocPage({ params }: Props) {
  const { slug } = await params;
  const key = slug?.join("/") ?? "";
  const doc = await loadDoc(key);
  if (!doc) notFound();
  const i = DOCS.findIndex((d) => d.slug === key);
  const prev = DOCS[i - 1];
  const next = DOCS[i + 1];
  const href = (s: string) => (s ? `/docs/${s}` : "/docs");

  return (
    <main>
      <p className="crumbs small">
        <Link href="/docs">Docs</Link> {key && <>/ {doc.page.title}</>}
      </p>
      <article className="doc" dangerouslySetInnerHTML={{ __html: doc.html }} />
      <nav className="pager">
        {prev ? (
          <Link href={href(prev.slug)} className="pager-link">
            <span className="muted tiny">← Previous</span>
            <span>{prev.title}</span>
          </Link>
        ) : (
          <span />
        )}
        {next && (
          <Link href={href(next.slug)} className="pager-link right">
            <span className="muted tiny">Next →</span>
            <span>{next.title}</span>
          </Link>
        )}
      </nav>
    </main>
  );
}
