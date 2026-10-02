// Clue text with links made clickable. Links open in a new tab with no referrer.
// They aren't embedded or previewed: an embedded player would tell that site
// about every visitor, so we only contact it if the solver chooses to click.
const URL_RE = /(https?:\/\/[^\s<>"']+)/g;

/** Trims sentence punctuation after a URL, keeping a ")" that closes a "(" inside it. */
function splitTrailing(url: string): [string, string] {
  let end = url.length;
  while (end > 0) {
    const ch = url[end - 1];
    if (".,;:!?".includes(ch)) end--;
    else if (ch === ")") {
      const body = url.slice(0, end);
      const open = (body.match(/\(/g) ?? []).length;
      const close = (body.match(/\)/g) ?? []).length;
      if (close > open) end--;
      else break;
    } else break;
  }
  return [url.slice(0, end), url.slice(end)];
}

export default function ClueText({ text }: { text: string }) {
  const parts = text.split(URL_RE);
  return (
    <>
      {parts.map((p, i) => {
        if (i % 2 === 0) return <span key={i}>{p}</span>;
        const [href, rest] = splitTrailing(p);
        return (
          <span key={i}>
            <a href={href} target="_blank" rel="noreferrer noopener" title="Opens another site, which can see your visit">
              {href}
              <span className="ext"> ↗</span>
            </a>
            {rest}
          </span>
        );
      })}
    </>
  );
}
