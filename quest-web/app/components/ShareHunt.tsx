"use client";

// Share a hunt with a friend: copy the link, show a QR code to scan, use the
// phone's share sheet, or open a message in another app. Nothing is contacted
// until the person picks an app; the QR code is drawn here.
import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import QrCode from "./QrCode";
import { IconShare } from "./Icons";

export default function ShareHunt({
  huntId,
  title,
  stages,
  fragment,
}: {
  huntId: string;
  title: string;
  stages: number;
  /** For a private hunt: "k=<invite key>". It goes after # so it never reaches the server. */
  fragment?: string;
}) {
  const path = `/hunt/${huntId}${fragment ? `#${fragment}` : ""}`;
  const ref = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState(path);
  const [copied, setCopied] = useState(false);
  const [canShare, setCanShare] = useState(false);

  useEffect(() => {
    setUrl(new URL(path, window.location.origin).toString());
    setCanShare(typeof navigator.share === "function");
  }, [path]);

  useEffect(() => {
    if (open && ref.current && !ref.current.open) ref.current.showModal();
    if (!open && ref.current?.open) ref.current.close();
  }, [open]);

  const text = `Can you solve “${title}”? ${stages} clue${stages === 1 ? "" : "s"}, and the prize is shielded Zcash.`;
  const enc = encodeURIComponent;
  const apps = [
    { name: "WhatsApp", href: `https://wa.me/?text=${enc(`${text} ${url}`)}` },
    { name: "Telegram", href: `https://t.me/share/url?url=${enc(url)}&text=${enc(text)}` },
    { name: "X", href: `https://x.com/intent/post?text=${enc(text)}&url=${enc(url)}` },
    { name: "Email", href: `mailto:?subject=${enc(title)}&body=${enc(`${text}\n\n${url}`)}` },
  ];

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard blocked: the link is selectable
    }
  }

  async function nativeShare() {
    try {
      await navigator.share({ title, text, url });
    } catch {
      // cancelled
    }
  }

  async function downloadQr() {
    const data = await QRCode.toDataURL(url, { margin: 2, width: 720, errorCorrectionLevel: "M", color: { dark: "#0d1117", light: "#ffffff" } });
    const a = document.createElement("a");
    a.href = data;
    a.download = `shielded-quest-${huntId.slice(0, 8)}-qr.png`;
    a.click();
  }

  return (
    <>
      <button type="button" className="share-btn" onClick={() => setOpen(true)}>
        <IconShare /> Share
      </button>
      <dialog
        ref={ref}
        className="confirm share"
        aria-labelledby="share-title"
        onCancel={(e) => {
          e.preventDefault();
          setOpen(false);
        }}
        onClick={(e) => e.target === ref.current && setOpen(false)}
      >
        {open && (
          <div className="confirm-body">
            <div className="row spread" style={{ alignItems: "flex-start" }}>
              <h3 id="share-title" style={{ margin: 0 }}>
                Share this hunt
              </h3>
              <button type="button" className="link" onClick={() => setOpen(false)} aria-label="Close" style={{ textDecoration: "none" }}>
                ✕
              </button>
            </div>
            <p className="muted small">Send a friend the link, or let them scan the code with their phone camera.</p>
            <div className="share-grid">
              <QrCode value={url} size={168} label={`QR code linking to ${title}`} />
              <div className="share-side">
                <div className="mono addr share-url">{url}</div>
                <div className="row" style={{ gap: 8 }}>
                  <button type="button" className="primary" onClick={copy}>
                    {copied ? "Copied" : "Copy link"}
                  </button>
                  <button type="button" onClick={downloadQr}>
                    Save QR image
                  </button>
                  {canShare && (
                    <button type="button" onClick={nativeShare}>
                      More…
                    </button>
                  )}
                </div>
                <div className="share-apps">
                  {apps.map((a) => (
                    <a key={a.name} href={a.href} target="_blank" rel="noreferrer noopener">
                      {a.name}
                    </a>
                  ))}
                </div>
              </div>
            </div>
            <p className="muted tiny" style={{ marginBottom: 0 }}>
              {fragment
                ? "This is a private hunt: anyone with this link can play, and the part after # is the key. It never reaches our server, but an app you share it through can see it."
                : "The link only opens the hunt. It doesn't include your progress or answers. Sharing through another app lets that app see the link."}
            </p>
          </div>
        )}
      </dialog>
    </>
  );
}
