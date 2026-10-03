export const LOAD_STATUS = {
	loading: 'loading',
	error: 'error',
	loaded: 'loaded',
} as const;

export type LoadStatus = (typeof LOAD_STATUS)[keyof typeof LOAD_STATUS];
