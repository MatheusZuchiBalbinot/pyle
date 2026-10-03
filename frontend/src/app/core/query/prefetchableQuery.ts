import type { QueryKey } from '@tanstack/react-query';

// A query a page reads, exported by the hook that reads it, so the shell can fetch it ahead
// of a visit with the same key and loader the page will use.
export type PrefetchableQuery<T = unknown> = { readonly queryKey: QueryKey; readonly queryFn: () => Promise<T> };
