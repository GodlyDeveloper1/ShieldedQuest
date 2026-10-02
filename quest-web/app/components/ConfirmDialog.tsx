"use client";

// In-app confirmation dialog (replaces the browser's "localhost says…" pop-up).
// Built on <dialog>: the browser handles focus trapping, Esc to cancel and
// screen-reader semantics; the look is ours.
//
//   const [confirm, dialog] = useConfirm();
//   if (!(await confirm({ title: "Start over?", body: "…", confirmLabel: "Clear" }))) return;
//   ...
//   return <>{dialog}…</>;
import { useCallback, useEffect, useRef, useState } from "react";

export interface ConfirmOptions {
  title: string;
  body?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

export function useConfirm(): [(o: ConfirmOptions) => Promise<boolean>, React.ReactNode] {
  const [opts, setOpts] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<((v: boolean) => void) | null>(null);
  const ref = useRef<HTMLDialogElement>(null);

  const confirm = useCallback((o: ConfirmOptions) => {
    setOpts(o);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const close = useCallback((answer: boolean) => {
    ref.current?.close();
    resolver.current?.(answer);
    resolver.current = null;
    setOpts(null);
  }, []);

  useEffect(() => {
    if (opts && ref.current && !ref.current.open) ref.current.showModal();
  }, [opts]);

  const dialog = (
    <dialog
      ref={ref}
      className="confirm"
      aria-labelledby="confirm-title"
      onCancel={(e) => {
        e.preventDefault(); // Esc
        close(false);
      }}
      onClick={(e) => {
        if (e.target === ref.current) close(false); // click on the backdrop
      }}
    >
      {opts && (
        <div className="confirm-body">
          <h3 id="confirm-title">{opts.title}</h3>
          {opts.body && <div className="muted small">{opts.body}</div>}
          <div className="confirm-actions">
            <button type="button" onClick={() => close(false)}>
              {opts.cancelLabel ?? "Cancel"}
            </button>
            <button type="button" className={opts.danger ? "danger" : "primary"} onClick={() => close(true)} autoFocus>
              {opts.confirmLabel ?? "OK"}
            </button>
          </div>
        </div>
      )}
    </dialog>
  );

  return [confirm, dialog];
}
