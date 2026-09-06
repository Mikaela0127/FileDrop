import { describe, expect, it } from "vitest";
import { english, translations, type Locale } from "./translations";

const translatedLocales: readonly Locale[] = ["zh-CN", "zh-TW"];
const intentionallySharedKeys = new Set([
  "language.en",
  "language.zhCN",
  "language.zhTW",
]);

function variables(value: string): string[] {
  return [...value.matchAll(/\{([^}]+)\}/g)].map((match) => match[1]).sort();
}

describe("interface translations", () => {
  it.each(translatedLocales)("covers every English key in %s", (locale) => {
    expect(Object.keys(translations[locale]).sort()).toEqual(
      Object.keys(english).sort(),
    );
  });

  it.each(translatedLocales)(
    "translates every interface message in %s",
    (locale) => {
      for (const key of Object.keys(english) as (keyof typeof english)[]) {
        if (!intentionallySharedKeys.has(key)) {
          expect(translations[locale][key], key).not.toBe(english[key]);
        }
      }
    },
  );

  it.each(translatedLocales)(
    "preserves interpolation variables in %s",
    (locale) => {
      for (const key of Object.keys(english) as (keyof typeof english)[]) {
        expect(variables(translations[locale][key]), key).toEqual(
          variables(english[key]),
        );
      }
    },
  );
});
