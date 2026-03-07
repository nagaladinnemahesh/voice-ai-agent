import { franc } from "franc";

const languageMap: Record<string, string> = {
  eng: "English",
  hin: "Hindi",
  tam: "Tamil",
};

export function detectLanguage(text: string) {
  const langCode = franc(text, {
    minLength: 3,
    only: ["eng", "hin", "tam"],
  });

  if (langCode === "und") {
    return "English";
  }

  return languageMap[langCode] || langCode;
}
