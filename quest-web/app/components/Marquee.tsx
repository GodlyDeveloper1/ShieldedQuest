// An endless strip of words. Pure CSS; pauses on hover and for reduced motion.
export default function Marquee({ items, tone = "gold" }: { items: string[]; tone?: "gold" | "dark" }) {
  const row = (hidden: boolean) => (
    <div className="mq-row" aria-hidden={hidden || undefined}>
      {items.map((t, i) => (
        <span key={i}>
          {t}
          <i className="mq-star">✦</i>
        </span>
      ))}
    </div>
  );
  return (
    <div className={`marquee ${tone}`} data-reveal="fade">
      <div className="mq-track">
        {row(false)}
        {row(true)}
      </div>
    </div>
  );
}
