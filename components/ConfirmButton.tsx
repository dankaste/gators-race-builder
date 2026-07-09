"use client";

import { useEffect, useRef, useState } from "react";

/**
 * A button that asks for confirmation in-app (arm on first click, confirm on
 * second) instead of via `window.confirm()`. Native confirm dialogs can be
 * silently suppressed by the browser (e.g. after repeated-dialog prevention)
 * or by embedded/automated contexts, which makes the action look like it
 * does nothing at all. This never depends on a browser dialog.
 */
export function ConfirmButton({
  onConfirm,
  prompt,
  confirmLabel = "Confirm",
  className,
  disabled,
  title,
  children,
}: {
  onConfirm: () => void | Promise<void>;
  prompt: string;
  confirmLabel?: string;
  className: string;
  disabled?: boolean;
  title?: string;
  children: React.ReactNode;
}) {
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  function arm() {
    setArmed(true);
    timer.current = setTimeout(() => setArmed(false), 5000);
  }

  async function confirmClick() {
    if (timer.current) clearTimeout(timer.current);
    setBusy(true);
    try {
      await onConfirm();
    } finally {
      setBusy(false);
      setArmed(false);
    }
  }

  if (armed) {
    return (
      <span className="inline-flex items-center gap-2">
        <span className="text-xs text-muted">{prompt}</span>
        <button onClick={confirmClick} disabled={busy} className="text-sm font-semibold text-danger hover:underline disabled:opacity-50">
          {busy ? "Working…" : confirmLabel}
        </button>
        <button onClick={() => setArmed(false)} disabled={busy} className="text-sm text-muted hover:text-foreground">
          Cancel
        </button>
      </span>
    );
  }

  return (
    <button onClick={arm} disabled={disabled} className={className} title={title}>
      {children}
    </button>
  );
}
