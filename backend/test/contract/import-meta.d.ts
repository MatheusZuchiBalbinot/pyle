// The console's runtimeConfig reads Vite's import.meta.env; only its type matters here.
interface ImportMeta {
	readonly env: Readonly<Record<string, string | undefined>>;
}
