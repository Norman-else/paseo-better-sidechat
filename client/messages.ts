import { defineTranslations, useTranslation } from "@getpaseo/plugin/client";
import { en, zh } from "../shared/messages";

export const messages = defineTranslations({
  resources: {
    en,
    zh,
    "zh-CN": zh,
    "zh-Hans": zh,
    "zh-TW": zh,
  },
});

export function useMessages() {
  return useTranslation(messages);
}
