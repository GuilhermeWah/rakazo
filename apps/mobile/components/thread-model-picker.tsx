import type { ThinkingLevel } from "@rakazo/contracts";
import {
  chatModelEffort,
  connectedModelChoices,
  modelOptionKey,
  parseModelOptionKey,
  resolveSelectableModelId,
} from "@rakazo/core";
import { useFocusEffect } from "expo-router";
import { useCallback, useRef, useState } from "react";
import { Alert, Text, View } from "react-native";
import type { MobileBot, MobileMe, MobileModel, MobileModelCredential } from "../lib/api";
import { rpc } from "../lib/api";
import { useI18n } from "../lib/i18n";
import { useMobileTokens } from "../lib/native";
import { errorText } from "../lib/user-error";
import { MenuPickerMenu } from "./menu-picker";
import { NativeSymbol } from "./native-symbol";

export function ThreadModelPicker({
  bot,
  onUpdated,
  onBusyChange,
  disabled = false,
}: {
  bot: MobileBot;
  disabled?: boolean;
  onUpdated: (bot: MobileBot) => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const { t } = useI18n();
  const tokens = useMobileTokens();
  const [metadata, setMetadata] = useState<{
    credentials: MobileModelCredential[];
    catalog: MobileModel[];
    me: MobileMe;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const choosing = useRef(false);
  useFocusEffect(
    useCallback(() => {
      let current = true;
      let attempt = 0;
      async function load() {
        if (!current) return;
        const thisAttempt = ++attempt;
        try {
          const [credentials, catalog, me] = await Promise.all([
            rpc<MobileModelCredential[]>("models/credentials"),
            rpc<MobileModel[]>("models/list"),
            rpc<MobileMe>("me"),
          ]);
          if (current && thisAttempt === attempt) setMetadata({ credentials, catalog, me });
        } catch (reason) {
          if (current && thisAttempt === attempt)
            Alert.alert(t("Could not load model settings"), errorText(reason, t("Try again.")), [
              { text: t("Cancel"), style: "cancel" },
              { text: t("Retry"), onPress: () => void load() },
            ]);
        }
      }
      void load();
      return () => {
        current = false;
      };
    }, []),
  );
  const catalog = metadata?.catalog ?? [];
  const options = connectedModelChoices(metadata?.credentials ?? [], catalog);
  const value =
    bot.modelProvider && bot.modelId ? modelOptionKey(bot.modelProvider, bot.modelId) : "";
  const displayValue =
    bot.modelProvider && bot.modelId
      ? modelOptionKey(
          bot.modelProvider,
          resolveSelectableModelId(catalog, bot.modelProvider, bot.modelId),
        )
      : "";
  const defaultModel = metadata?.me.defaultModel;
  const defaultLabel = defaultModel
    ? `${t("Space default")} (${catalog.find((entry) => entry.provider === metadata?.me.defaultProvider && entry.id === defaultModel)?.label ?? defaultModel})`
    : t("Space default");
  const choices = [
    ...(defaultModel ? [{ key: "", label: defaultLabel }] : []),
    ...options.map((option) => ({ key: option.key, label: option.label })),
  ];
  const effort = chatModelEffort(bot, metadata?.me, metadata?.credentials ?? [], catalog);
  const effortLabel = (level: ThinkingLevel) =>
    t(level === "xhigh" ? "Extra high" : `${level.slice(0, 1).toUpperCase()}${level.slice(1)}`);
  const effortChoices = [
    {
      key: "",
      label: effort.defaultLevel
        ? t("Default ({level})", { level: effortLabel(effort.defaultLevel) })
        : t("Default"),
    },
    ...effort.levels.map((level) => ({ key: level, label: effortLabel(level) })),
  ];
  async function save(
    patch: Partial<Pick<MobileBot, "modelProvider" | "modelId" | "thinkingLevel">>,
  ) {
    if (disabled || choosing.current || !metadata) return;
    choosing.current = true;
    setBusy(true);
    onBusyChange(true);
    try {
      const updated = await rpc<MobileBot>("bots/update", {
        botId: bot.id,
        ...patch,
      });
      onUpdated(updated);
    } catch (reason) {
      Alert.alert(t("Could not save bot"), errorText(reason, t("Try again.")));
    } finally {
      choosing.current = false;
      setBusy(false);
      onBusyChange(false);
    }
  }
  async function choose(key: string) {
    if (key === value || (key ? !options.some((choice) => choice.key === key) : !defaultModel))
      return;
    const selected = key ? parseModelOptionKey(key) : null;
    await save({
      modelProvider: selected?.provider ?? null,
      modelId: selected?.modelId ?? null,
      thinkingLevel: null,
    });
  }
  async function chooseEffort(level: string) {
    if (
      level === (effort.value ?? "") ||
      (level && !effort.levels.includes(level as ThinkingLevel))
    )
      return;
    await save({ thinkingLevel: (level || null) as ThinkingLevel | null });
  }
  const label =
    choices.find((choice) => choice.key === displayValue)?.label ??
    (value
      ? (catalog.find((entry) => entry.provider === bot.modelProvider && entry.id === bot.modelId)
          ?.label ?? bot.modelId)
      : defaultLabel) ??
    t("Model");
  return (
    <View
      pointerEvents={disabled || busy || !metadata ? "none" : "auto"}
      style={{ alignSelf: "flex-start", maxWidth: "100%", marginTop: 6, opacity: busy ? 0.5 : 1 }}
    >
      <View
        style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", maxWidth: "100%" }}
      >
        <MenuPickerMenu
          label={t("Model")}
          choices={choices}
          value={value}
          onChange={(key) => void choose(key)}
        >
          <View
            accessible
            accessibilityRole="button"
            accessibilityLabel={t("Model")}
            accessibilityValue={{ text: label }}
            accessibilityState={{ disabled: disabled || busy || !metadata }}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 6,
              paddingHorizontal: 8,
              paddingVertical: 4,
              maxWidth: "100%",
            }}
          >
            <Text
              numberOfLines={1}
              style={{ color: tokens.mutedForeground, fontSize: 12.5, flexShrink: 1 }}
            >
              {label}
            </Text>
            <NativeSymbol
              ios="chevron.down"
              android="chevron-down"
              size={11}
              color={tokens.mutedForeground}
            />
          </View>
        </MenuPickerMenu>
        {effort.levels.length > 0 || effort.value ? (
          <MenuPickerMenu
            label={t("Reasoning effort")}
            choices={effortChoices}
            value={effort.value ?? ""}
            onChange={(level) => void chooseEffort(level)}
          >
            <View
              accessible
              accessibilityRole="button"
              accessibilityLabel={t("Reasoning effort")}
              accessibilityValue={{
                text: effort.value ? effortLabel(effort.value) : effortChoices[0]?.label,
              }}
              accessibilityState={{ disabled: disabled || busy || !metadata }}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 6,
                paddingHorizontal: 8,
                paddingVertical: 4,
                maxWidth: "100%",
              }}
            >
              <Text
                numberOfLines={1}
                style={{ color: tokens.mutedForeground, fontSize: 12.5, flexShrink: 1 }}
              >
                {effort.value ? effortLabel(effort.value) : effortChoices[0]?.label}
              </Text>
              <NativeSymbol
                ios="chevron.down"
                android="chevron-down"
                size={11}
                color={tokens.mutedForeground}
              />
            </View>
          </MenuPickerMenu>
        ) : null}
      </View>
    </View>
  );
}
