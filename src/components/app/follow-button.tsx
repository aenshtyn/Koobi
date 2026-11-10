"use client";
import { useEffect, useState, useSyncExternalStore, useTransition } from "react";
import { useRouter } from "next/navigation";
import { UserRoundCheck, UserRoundPlus } from "lucide-react";
import { Modal, ModalClose } from "@/components/app/modal";
import { followExpert, unfollowExpert } from "@/app/(app)/following/actions";

/**
 * One shared answer to "whom do I follow?", so the Following page, Explore and an expert's profile
 * always agree. It is read once per page view and updated when a button here changes it.
 */
type Store = { loaded: boolean; signedIn: boolean; ready: boolean; slugs: ReadonlySet<string> };
const EMPTY: Store = { loaded: false, signedIn: false, ready: true, slugs: new Set() };
let store: Store = EMPTY;
let loading = false;
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());
const subscribe = (f: () => void) => {
  subs.add(f);
  return () => {
    subs.delete(f);
  };
};

function load() {
  if (store.loaded || loading) return;
  loading = true;
  fetch("/following/state", { credentials: "same-origin" })
    .then((r) => r.json())
    .then((d: { signedIn?: boolean; ready?: boolean; slugs?: string[] }) => {
      store = { loaded: true, signedIn: !!d.signedIn, ready: d.ready !== false, slugs: new Set(d.slugs ?? []) };
    })
    .catch(() => {
      store = { ...store, loaded: true };
    })
    .finally(() => {
      loading = false;
      emit();
    });
}

function set(slug: string, on: boolean) {
  const slugs = new Set(store.slugs);
  if (on) slugs.add(slug);
  else slugs.delete(slug);
  store = { ...store, slugs };
  emit();
}

/**
 * Follow or unfollow an expert. Unfollowing asks first. `small` is the compact form on Explore cards.
 * `known` is set where the server already knows the answer (the Following page).
 */
export function FollowButton({ slug, name, small = false, known }: { slug: string; name: string; small?: boolean; known?: boolean }) {
  const s = useSyncExternalStore(subscribe, () => store, () => EMPTY);
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  useEffect(load, []);
  const first = name.split(" ")[0];
  const following = s.loaded ? s.slugs.has(slug) : !!known;
  const base = small ? "chip sm relative z-[2] h-[30px]! px-2.5! text-[12.5px]!" : "btn2";

  if (s.loaded && !s.ready) return null;
  if (s.loaded && !s.signedIn) {
    return (
      <a className={small ? base : "btn2"} href={`/signin?next=${encodeURIComponent(`/teachers/${slug}`)}`}>
        <UserRoundPlus size={small ? 14 : 18} aria-hidden="true" />
        Follow
      </a>
    );
  }

  const run = (on: boolean) =>
    start(async () => {
      setError(null);
      const r = on ? await followExpert(slug) : await unfollowExpert(slug);
      if (!r.ok) return setError(r.error ?? "That did not work. Try again.");
      set(slug, on);
      router.refresh();
    });

  if (!following) {
    return (
      <span className={small ? "contents" : "flex flex-col items-start gap-1"}>
        <button type="button" className={base} disabled={pending || !s.loaded} onClick={() => run(true)} aria-label={`Follow ${name}`}>
          <UserRoundPlus size={small ? 14 : 18} aria-hidden="true" />
          {pending ? "Following…" : "Follow"}
        </button>
        {error && !small ? (
          <span className="field-error" role="alert">
            {error}
          </span>
        ) : null}
      </span>
    );
  }
  return (
    <Modal
      title={`Unfollow ${name}?`}
      triggerClass={small ? `${base} on` : "btn2 ink"}
      trigger={
        <>
          <UserRoundCheck size={small ? 14 : 18} aria-hidden="true" />
          Following
        </>
      }
    >
      <p className="text-ink-2">
        You will stop getting updates from {first}. Your bookings, payments, packages and conversations with {first} stay exactly as they are.
      </p>
      {error ? (
        <p className="field-error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center justify-end gap-3">
        <ModalClose className="btn2 ink">Keep following</ModalClose>
        <button
          type="button"
          className="btn"
          disabled={pending}
          onClick={(e) => {
            const dialog = e.currentTarget.closest("dialog");
            run(false);
            dialog?.close();
          }}
        >
          {pending ? "Unfollowing…" : "Unfollow"}
        </button>
      </div>
    </Modal>
  );
}
