"use client";

// QR code drawn locally in the browser (no QR service is contacted).
import { useEffect, useState } from "react";
import QRCode from "qrcode";

export default function QrCode({ value, size = 168, label }: { value: string; size?: number; label?: string }) {
  const [svg, setSvg] = useState<string>("");
  useEffect(() => {
    let live = true;
    QRCode.toString(value, { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#0d1117", light: "#ffffff" } })
      .then((s) => live && setSvg(s))
      .catch(() => live && setSvg(""));
    return () => {
      live = false;
    };
  }, [value]);
  return (
    <div
      className="qr"
      role="img"
      aria-label={label ?? "QR code"}
      style={{ width: size, height: size }}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
