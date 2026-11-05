import { ArrowRight, Search } from "lucide-react";

/** Plain GET form to /explore: works without JavaScript. */
export function SearchForm({ small = false, defaultValue = "", action = "/explore", id = "q" }: { small?: boolean; defaultValue?: string; action?: string; id?: string }) {
  return (
    <form className={`search${small ? " sm" : ""}`} role="search" action={action}>
      <Search size={small ? 20 : 24} aria-hidden="true" />
      <label className="sr-only" htmlFor={id}>
        What do you want to learn?
      </label>
      <input id={id} name="q" type="search" placeholder="What do you want to learn?" defaultValue={defaultValue} />
      <button className={`go${small ? " line" : ""}`} type="submit" aria-label="Search learning offers">
        <ArrowRight size={small ? 18 : 22} strokeWidth={2.2} aria-hidden="true" />
      </button>
    </form>
  );
}
