// The stable import path: the endpoints live in ./client/, one file per domain,
// over the shared request plumbing in ./client/request.

export { AdminApiError } from './client/request';
export * from './client/services';
export * from './client/routes';
export * from './client/consumers';
export * from './client/traffic';
export * from './client/alerts';
export * from './client/ai';
export * from './client/platform';
