import type { QueryClient } from "@tanstack/react-query";

/** A discussion can be cached by UUID or public slug, under different viewers. */
export function invalidateForumThreadQueries(client: QueryClient) {
  return Promise.all([
    client.invalidateQueries({ queryKey: ["forum", "post"] }),
    client.invalidateQueries({ queryKey: ["forum", "posts"] }),
    client.invalidateQueries({ queryKey: ["forum", "discovery"] }),
  ]);
}
