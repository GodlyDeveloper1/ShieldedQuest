"use client";

// Printable cards for real-world hunts (meetups, conferences, classrooms).
// - Start card: hunt title, first clue and a QR code to the hunt page. Public.
// - Code cards (creator only): one per stage, with that stage's answer, to hide at
//   each location. Only shown where the answers are already in this browser
//   (right after creating the hunt). Printing happens locally.
import { useEffect, useState } from "react";
import QrCode from "./QrCode";

export interface PrintData {
  title: string;
  firstClue: string;
  huntPath: string; // e.g. /hunt/<id>
  answers?: string[];
}

export default function PrintCards({ data, label = "Print cards" }: { data: PrintData; label?: string }) {
  const [url, setUrl] = useState(data.huntPath);
  useEffect(() => setUrl(new URL(data.huntPath, window.location.origin).toString()), [data.huntPath]);
  const n = data.answers?.length ?? 0;
  return (
    <>
      <button type="button" onClick={() => window.print()}>
        {label}
      </button>
      <div className="print-sheet" aria-hidden="true">
        <div className="pcard start">
          <p className="pk">Shielded Quest · treasure hunt</p>
          <h2>{data.title}</h2>
          <div className="pgrid">
            <QrCode value={url} size={150} label="Hunt link" />
            <div>
              <p className="pk">Clue 1</p>
              <p className="pclue">{data.firstClue}</p>
            </div>
          </div>
          <p className="pfoot">Scan to play. Your answers are checked on your phone and never sent anywhere. {url}</p>
        </div>
        {data.answers?.map((a, i) => (
          <div key={i} className="pcard code">
            <p className="pk">
              {data.title} · stage {i + 1} of {n}
              {i === n - 1 ? " · final" : ""}
            </p>
            <p className="pcode">{a}</p>
            <p className="pfoot">
              {i === n - 1
                ? "You found the last code. Enter it on the hunt page to unlock the prize. Hide this one well."
                : `You found stage ${i + 1}. Enter this code on the hunt page to get the next clue.`}
            </p>
          </div>
        ))}
      </div>
    </>
  );
}
