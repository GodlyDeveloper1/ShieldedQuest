"use client";

import { cx } from "@/lib/cx";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import Logo from "./Logo";
import { IconEye, IconFlag, IconGraduation, IconKey, IconMap, IconShield, IconSpark } from "./Icons";
import type { ChainStatus } from "@/lib/signer";

type Item = { href: string; label: string; icon: React.ReactNode; exact?: boolean };

const GROUPS: { title: string; items: Item[] }[] = [
  {
    title: "Play",
    items: [
      { href: "/hunts", label: "Explore hunts", icon: <IconMap /> },
      { href: "/create", label: "Create a hunt", icon: <IconKey /> },
      { href: "/demo", label: "One-minute hunt", icon: <IconSpark /> },
    ],
  },
  {
    title: "Learn",
    items: [
      { href: "/docs", label: "Getting started", icon: <IconGraduation />, exact: true },
      { href: "/docs/how-it-works", label: "How it works", icon: <IconFlag /> },
      { href: "/docs/creators", label: "For creators", icon: <IconKey /> },
      { href: "/docs/solvers", label: "For solvers", icon: <IconMap /> },
      { href: "/docs/privacy", label: "Privacy", icon: <IconShield /> },
      { href: "/docs/verify", label: "Verify it yourself", icon: <IconEye /> },
      { href: "/docs/faq", label: "FAQ", icon: <IconSpark /> },
      { href: "/docs/pages", label: "Page guide", icon: <IconMap /> },
    ],
  },
];

export default function Sidebar({ status }: { status: ChainStatus | null }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [path]); // close the mobile menu after navigating

  const active = (it: Item) =>
    it.exact ? path === it.href : path === it.href || path.startsWith(it.href + "/") || (it.href === "/hunts" && path.startsWith("/hunt/"));

  return (
    <>
      <div className="topbar">
        <Link className="brand" href="/">
          <Logo size={24} />
          <span>
            Shielded <b>Quest</b>
          </span>
        </Link>
        <button className="menu-btn" aria-label="Menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          <span />
          <span />
          <span />
        </button>
      </div>
      {open && <div className="scrim" onClick={() => setOpen(false)} />}
      <aside className={cx("side", open && "open")}>
        <Link className="brand side-brand" href="/">
          <Logo />
          <span>
            Shielded <b>Quest</b>
          </span>
        </Link>
        <nav>
          {GROUPS.map((g) => (
            <div key={g.title} className="side-group">
              <p className="side-title">{g.title}</p>
              {g.items.map((it) => (
                <Link key={it.href} href={it.href} className={cx("side-link", active(it) && "on")}>
                  {it.icon}
                  <span>{it.label}</span>
                </Link>
              ))}
            </div>
          ))}
        </nav>
        <div className="side-foot">
          {status ? (
            <p className="status">
              <i className="dot good" /> Testnet · block {status.chain_tip.toLocaleString()}
            </p>
          ) : (
            <p className="status">
              <i className="dot bad" /> Signer offline
            </p>
          )}
          <p className="muted tiny">Built for the Zecathon by Diaguren Labs</p>
        </div>
      </aside>
    </>
  );
}
