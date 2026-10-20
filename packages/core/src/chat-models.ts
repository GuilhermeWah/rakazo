import type { Bot, Me, ModelCatalogEntry, ModelCredential, ThinkingLevel } from "@rakazo/contracts";
import {
  clampCatalogThinkingLevel,
  credentialForModel,
  resolveSelectableModelId,
} from "./model-providers.js";

/** Effort follows the effective bot model, including an inherited space default. */
export function chatModelEffort(
  bot: Pick<Bot, "modelProvider" | "modelId" | "thinkingLevel">,
  defaults: Pick<Me, "defaultProvider" | "defaultModel"> | undefined,
  credentials: readonly ModelCredential[],
  catalog: readonly ModelCatalogEntry[],
) {
  const provider = bot.modelProvider ?? defaults?.defaultProvider;
  const modelId = bot.modelId ?? defaults?.defaultModel;
  const entry = catalog.find(
    (model) =>
      model.provider === provider &&
      resolveSelectableModelId(catalog, model.provider, model.id) === modelId,
  );
  const credential = credentialForModel(credentials, provider, modelId);
  const levels: ThinkingLevel[] = (
    credential?.thinkingLevels ??
    entry?.thinkingLevels ??
    []
  ).filter((level) => level !== "off");
  const defaultLevel = clampCatalogThinkingLevel(
    (credential?.modelId === modelId ? credential?.thinkingLevel : undefined) ?? "medium",
    levels,
  ) as ThinkingLevel | null;
  const value = bot.thinkingLevel && levels.includes(bot.thinkingLevel) ? bot.thinkingLevel : null;
  return { levels, defaultLevel, value };
}
