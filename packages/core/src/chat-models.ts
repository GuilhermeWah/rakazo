import type { Bot, Me, ModelCatalogEntry, ModelCredential, ThinkingLevel } from "@rakazo/contracts";
import { canonicalPiProviderId } from "@rakazo/contracts";
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
  const rawProvider = bot.modelProvider ?? defaults?.defaultProvider;
  const provider = rawProvider ? canonicalPiProviderId(rawProvider) : undefined;
  const rawModelId = bot.modelId ?? defaults?.defaultModel;
  const modelId =
    provider && rawModelId ? resolveSelectableModelId(catalog, provider, rawModelId) : rawModelId;
  const entry = catalog.find(
    (model) =>
      canonicalPiProviderId(model.provider) === provider &&
      resolveSelectableModelId(catalog, model.provider, model.id) === modelId,
  );
  const credential = credentialForModel(credentials, provider, modelId);
  const preferenceModelId =
    credential?.modelId && provider
      ? resolveSelectableModelId(catalog, provider, credential.modelId)
      : credential?.modelId;
  const levels: ThinkingLevel[] = (
    credential?.thinkingLevels ??
    entry?.thinkingLevels ??
    []
  ).filter((level) => level !== "off");
  const defaultLevel = clampCatalogThinkingLevel(
    (preferenceModelId === modelId ? credential?.thinkingLevel : undefined) ??
      credential?.connectionThinkingLevel ??
      "medium",
    levels,
  ) as ThinkingLevel | null;
  const value = bot.thinkingLevel ?? null;
  return { levels, defaultLevel, value };
}
