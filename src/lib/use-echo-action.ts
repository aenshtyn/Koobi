"use client";
import { useActionState } from "react";
import { echo, type Echo } from "./form-values";

/**
 * useActionState that keeps what was typed when the server answers with an error (React 19 resets
 * the form after every action). Fields read it back with defaultValue={state.values?.name}.
 */
export function useEchoAction<S extends { error?: string }>(fn: (prev: S, form: FormData) => Promise<S>, init: S) {
  type WithValues = S & { values?: Echo };
  return useActionState<WithValues, FormData>(async (prev, form) => {
    const r = await fn(prev, form);
    return (r?.error ? { ...r, values: echo(form) } : r) as Awaited<WithValues>;
  }, init as Awaited<WithValues>);
}
