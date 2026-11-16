import { useEffect, useRef, type ReactNode, type RefObject } from "react";

// The confirm dialog the delete buttons use (Delete activity, R31; Delete speech, R32).

/** A native modal <dialog> (focus trapped, Escape cancels) with its Cancel button focused when it opens. Where
 * showModal is missing (older browsers, jsdom) it opens as a plain open dialog. */
export function ConfirmDialog({
  labelledBy,
  onCancel,
  children,
}: {
  labelledBy: string;
  onCancel: () => void;
  children: (cancelRef: RefObject<HTMLButtonElement | null>) => ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (dialog === null) return;
    if (!dialog.open) {
      if (typeof dialog.showModal === "function") dialog.showModal();
      else dialog.setAttribute("open", "");
    }
    cancelRef.current?.focus();
    return () => {
      if (dialog.open && typeof dialog.close === "function") dialog.close();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className="confirm"
      aria-labelledby={labelledBy}
      onCancel={(event) => {
        event.preventDefault(); // React decides when it closes (not while the delete is being sent)
        onCancel();
      }}
    >
      {children(cancelRef)}
    </dialog>
  );
}

/** Puts focus back on `trigger` when `open` goes from true to false. Closing the dialog (Cancel, Escape, a failed
 * delete) unmounts it, which leaves focus on <body>. This runs after the dialog's own cleanup, so nothing moves focus
 * again afterwards. */
export function useFocusReturn(open: boolean, trigger: RefObject<HTMLElement | null>): void {
  const wasOpen = useRef(false);
  useEffect(() => {
    if (open) wasOpen.current = true;
    else if (wasOpen.current) {
      wasOpen.current = false;
      trigger.current?.focus();
    }
  }, [open, trigger]);
}
