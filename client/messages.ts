import { defineTranslations, useTranslation } from "@getpaseo/plugin/client";
import { allLocaleResources } from "../shared/messages";

export const messages = defineTranslations({
  resources: allLocaleResources,
});

export function useMessages() {
  return useTranslation(messages);
}
