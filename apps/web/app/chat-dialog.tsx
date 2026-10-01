'use client';
import { useEffect, useRef, type ReactNode } from 'react';

export function ChatDialog({
  children,
  label,
  onClose,
  sheet = false,
}: {
  children: ReactNode;
  label: string;
  onClose: () => void;
  sheet?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const dialog = ref.current!;
    const media = window.matchMedia('(min-width: 1024px)');
    const show = () => {
      const focused = dialog.contains(document.activeElement)
        ? (document.activeElement as HTMLElement)
        : null;
      const body = dialog.querySelector('.settings-modal-body');
      const scrollTop = body?.scrollTop ?? 0;
      dialog.close();
      if (sheet && media.matches) dialog.show();
      else dialog.showModal();
      focused?.focus({ preventScroll: true });
      if (body) body.scrollTop = scrollTop;
    };
    show();
    media.addEventListener('change', show);
    return () => {
      media.removeEventListener('change', show);
      dialog.close();
      previous?.focus();
    };
  }, [sheet]);
  return (
    <dialog
      className={sheet ? 'chat-settings-drawer' : 'chat-confirm-dialog'}
      ref={ref}
      aria-label={label}
      onKeyDown={(event) => {
        if (
          event.key !== 'Tab' ||
          (sheet && window.matchMedia('(min-width: 1024px)').matches)
        )
          return;
        const focusable = Array.from(
          event.currentTarget.querySelectorAll<HTMLElement>(
            'button, input, select, textarea, a[href], [tabindex]',
          ),
        ).filter(
          (element) =>
            !element.matches(':disabled') &&
            element.tabIndex >= 0 &&
            element.getClientRects().length,
        );
        const first = focusable[0];
        const last = focusable.at(-1);
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      {children}
    </dialog>
  );
}
