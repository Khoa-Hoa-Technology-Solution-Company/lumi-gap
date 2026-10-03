import { ResearchComposer } from "./research-composer";

export function ResearchSearch({ id = "home-literature-search" }: { id?: string }) {
  return <ResearchComposer id={id} />;
}
