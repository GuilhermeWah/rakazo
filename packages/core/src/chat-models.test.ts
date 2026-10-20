import type { Bot, ModelCatalogEntry, ModelCredential } from "@rakazo/contracts";
import { describe, expect, it } from "vitest";
import { chatModelEffort } from "./chat-models.js";

const credential: ModelCredential = {
  id: "credential",
  provider: "openai-codex",
  label: "OpenAI Codex",
  hasKey: true,
  isDefault: true,
  modelId: "gpt-6.1-sol",
  thinkingLevel: "medium",
};
const bot: Pick<Bot, "modelProvider" | "modelId" | "thinkingLevel"> = {
  modelProvider: null,
  modelId: null,
  thinkingLevel: null,
};
const entry = (id: string, provider = "openai-codex"): ModelCatalogEntry => ({
  provider,
  providerName: provider,
  id,
  label: id,
  billing: "",
  reasoning: true,
  thinkingLevels: ["off", "low", "medium", "high", "xhigh", "max"],
});

describe("chat model effort", () => {
  const catalog: ModelCatalogEntry[] = [
    entry("gpt-6.1-sol"),
    { ...entry("claude-sonnet-5-5", "anthropic"), thinkingLevels: ["low", "high"] },
  ];
  it("uses the runtime default when a connection's effort belongs to another model", () => {
    const differentModel = entry("another-reasoning-model");
    const result = chatModelEffort(
      { ...bot, modelProvider: "openai-codex", modelId: differentModel.id },
      undefined,
      [{ ...credential, thinkingLevel: "high", enabledModelIds: [differentModel.id] }],
      [differentModel],
    );
    expect(result.defaultLevel).toBe("medium");
    expect(result.value).toBeNull();
  });
  it("uses the inherited model and shows only its supported effort levels", () => {
    const result = chatModelEffort(
      bot,
      { defaultProvider: "openai-codex", defaultModel: "gpt-6.1-sol" },
      [credential],
      catalog,
    );
    expect(result).toEqual({
      levels: ["low", "medium", "high", "xhigh", "max"],
      defaultLevel: "medium",
      value: null,
    });
  });
  it("inherits connection-wide effort for another enabled compatible model", () => {
    const compatible = {
      ...credential,
      provider: "openai-compatible",
      authKind: "openai_compatible" as const,
      modelId: "model-a",
      enabledModelIds: ["model-a", "model-b"],
      thinkingLevel: "low" as const,
      connectionThinkingLevel: "high" as const,
      thinkingLevels: ["low", "medium", "high"] as ModelCredential["thinkingLevels"],
    };
    expect(
      chatModelEffort(
        { ...bot, modelProvider: compatible.provider, modelId: "model-b" },
        undefined,
        [compatible],
        [],
      ).defaultLevel,
    ).toBe("high");
    expect(
      chatModelEffort(
        { ...bot, modelProvider: compatible.provider, modelId: "model-a" },
        undefined,
        [compatible],
        [],
      ).defaultLevel,
    ).toBe("low");
  });
  it("follows a bot override and ignores effort levels from another provider", () => {
    const result = chatModelEffort(
      { ...bot, modelProvider: "anthropic", modelId: "claude-sonnet-5-5", thinkingLevel: "high" },
      { defaultProvider: "openai-codex", defaultModel: "gpt-6.1-sol" },
      [credential],
      catalog,
    );
    expect(result).toEqual({ levels: ["low", "high"], defaultLevel: "high", value: "high" });
  });
  it("respects endpoint capabilities and does not offer unsupported persisted effort", () => {
    const custom = {
      ...credential,
      provider: "openai-compatible",
      modelId: "gpt-6-luna",
      thinkingLevels: ["low", "high"] as ModelCredential["thinkingLevels"],
    };
    expect(
      chatModelEffort(
        { ...bot, modelProvider: custom.provider, modelId: custom.modelId, thinkingLevel: "max" },
        undefined,
        [custom],
        [],
      ),
    ).toEqual({ levels: ["low", "high"], defaultLevel: "high", value: "max" });
  });
  it("offers no effort controls without known model capabilities", () => {
    expect(chatModelEffort(bot, undefined, [], [])).toEqual({
      levels: [],
      defaultLevel: null,
      value: null,
    });
  });
  it("resolves historical model labels before looking up effort capabilities", () => {
    const legacy = { ...entry("deepseek-flash", "deepseek"), label: "DeepSeek-V4.1-Flash" };
    expect(
      chatModelEffort(
        { ...bot, modelProvider: "deepseek", modelId: legacy.label },
        undefined,
        [],
        [legacy],
      ).levels,
    ).toEqual(["low", "medium", "high", "xhigh", "max"]);
  });
  it("keeps a stale override visible so selecting Default can clear it", () => {
    expect(chatModelEffort({ ...bot, thinkingLevel: "max" }, undefined, [], []).value).toBe("max");
  });
});
