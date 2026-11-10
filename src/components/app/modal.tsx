"use client";
import { useRef } from "react";
import { X } from "lucide-react";

/**
 * A button that opens a dialog over the page (reschedule, cancel, write a review, unfollow). It is
 * the browser's own dialog, so focus stays inside it and Escape closes it.
 */
export function Modal({ trigger, triggerClass, title, wide = false, children }: { trigger: React.ReactNode; triggerClass: string; title: string; wide?: boolean; children: React.ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  return (
    <>
      <button type="button" className={triggerClass} onClick={() => ref.current?.showModal()}>
        {trigger}
      </button>
      <dialog
        ref={ref}
        aria-label={title}
        className={`m-auto w-[calc(100vw-24px)] rounded-[20px] border-[1.5px] border-ink bg-card p-0 text-ink backdrop:bg-ink/45 ${wide ? "max-w-[640px]" : "max-w-[520px]"}`}
        onClick={(e) => {
          if (e.target === ref.current) ref.current?.close();
        }}
      >
        <div className="flex max-h-[calc(100dvh-32px)] flex-col gap-4 overflow-y-auto p-5 text-left sm:p-6">
          <div className="flex items-start justify-between gap-3">
            <h2 className="font-display text-[22px] leading-7 font-bold tracking-[-0.015em]">{title}</h2>
            <button type="button" className="iconbtn ghost -mt-2 -mr-2" aria-label="Close" onClick={() => ref.current?.close()}>
              <X size={20} aria-hidden="true" />
            </button>
          </div>
          {children}
        </div>
      </dialog>
    </>
  );
}

/** A button inside a Modal that only closes it ("Keep booking"). */
export function ModalClose({ className, children }: { className: string; children: React.ReactNode }) {
  return (
    <button type="button" className={className} onClick={(e) => e.currentTarget.closest("dialog")?.close()}>
      {children}
    </button>
  );
}
