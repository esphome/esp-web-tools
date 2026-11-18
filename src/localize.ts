type Values = Record<string, string | number>;
type Messages = Record<string, string>;

const loaders = new Map<string, () => Promise<{ default: Messages }>>([
  ["sv", () => import("./locales/sv.js")],
]);
const pending = new Map<string, Promise<void>>();
const catalogs = new Map<string, Messages>();

function locale(): string {
  const language = document.documentElement.lang || navigator.language;
  return language.toLowerCase().split("-")[0];
}

export function loadLocale(): Promise<void> {
  const language = locale();
  const load = loaders.get(language);
  if (!load) {
    return Promise.resolve();
  }

  let loading = pending.get(language);
  if (!loading) {
    loading = load().then(
      ({ default: messages }) => {
        catalogs.set(language, messages);
      },
      (err) => {
        pending.delete(language);
        console.warn(
          `Could not load ESP Web Tools translations for ${language}`,
          err,
        );
      },
    );
    pending.set(language, loading);
  }
  return loading;
}

export function t(source: string, values: Values = {}): string {
  const messages = catalogs.get(locale());
  const translated =
    messages && Object.prototype.hasOwnProperty.call(messages, source)
      ? messages[source]
      : source;
  return translated.replace(/\{(\w+)\}/g, (_, key: string) =>
    String(values[key] ?? `{${key}}`),
  );
}
