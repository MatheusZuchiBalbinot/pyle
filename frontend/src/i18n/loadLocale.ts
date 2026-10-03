// One file per namespace, assembled into the single translation resource.
export type TranslationTree = { readonly [key: string]: string | TranslationTree };

type LocaleModules = Readonly<Record<string, TranslationTree>>;

const NAMESPACE_FROM_PATH = /([^/]+)\.json$/;

export function buildTranslationResource(modules: LocaleModules): Readonly<Record<string, TranslationTree>> {
	const resource: Record<string, TranslationTree> = {};

	for (const [path, content] of Object.entries(modules)) {
		const namespace = NAMESPACE_FROM_PATH.exec(path)?.[1];

		if (!namespace) {
			continue;
		}

		resource[namespace] = content;
	}

	return resource;
}

const PT_BR_MODULES: LocaleModules = import.meta.glob<TranslationTree>('./locales/pt-BR/*.json', { eager: true, import: 'default' });

export const PT_BR_TRANSLATION = buildTranslationResource(PT_BR_MODULES);
