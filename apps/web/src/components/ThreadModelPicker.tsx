import { Trans, useLingui } from "@lingui/react/macro";
import type { Bot, Me, ModelCatalogEntry, ModelCredential, ThinkingLevel } from "@rakazo/contracts";
import {
  chatModelEffort,
  connectedModelChoices,
  modelOptionKey,
  parseModelOptionKey,
  resolveSelectableModelId,
} from "@rakazo/core";
import {
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@rakazo/ui-web";
import { useEffect, useRef, useState } from "react";
import { thinkingLevelLabel } from "../lib/model-catalog";
import { rpc } from "../lib/rpc";
import { errorText } from "../lib/user-error";

export function ThreadModelPicker({
  bot,
  onUpdated,
  onBusyChange,
  disabled = false,
}: {
  bot: Bot;
  disabled?: boolean;
  onUpdated: (bot: Bot) => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const { t } = useLingui();
  const [metadata, setMetadata] = useState<{
    credentials: ModelCredential[];
    catalog: ModelCatalogEntry[];
    me: Me;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loadAttempt = useRef(0);
  const saving = useRef(false);

  async function load() {
    const attempt = ++loadAttempt.current;
    try {
      const [credentials, catalog, me] = await Promise.all([
        rpc.models.credentials(),
        rpc.models.list(),
        rpc.me(),
      ]);
      if (attempt !== loadAttempt.current) return;
      setMetadata({ credentials, catalog, me });
      setError(null);
    } catch (reason) {
      if (attempt === loadAttempt.current)
        setError(errorText(reason, t`Could not load model settings`));
    }
  }
  useEffect(() => {
    void load();
    return () => {
      loadAttempt.current += 1;
    };
  }, []);

  const catalog = metadata?.catalog ?? [];
  const choices = connectedModelChoices(metadata?.credentials ?? [], catalog);
  const value =
    bot.modelProvider && bot.modelId
      ? modelOptionKey(
          bot.modelProvider,
          resolveSelectableModelId(catalog, bot.modelProvider, bot.modelId),
        )
      : "";
  const defaultModel = metadata?.me.defaultModel;
  const defaultLabel = defaultModel
    ? `${t`Space default`} (${catalog.find((entry) => entry.provider === metadata?.me.defaultProvider && entry.id === defaultModel)?.label ?? defaultModel})`
    : t`Space default`;
  const options = [
    ...(defaultModel ? [{ value: "", label: defaultLabel }] : []),
    ...choices.map((choice) => ({ value: choice.key, label: choice.label })),
  ];
  const currentLabel =
    options.find((option) => option.value === value)?.label ??
    (value
      ? (catalog.find((entry) => entry.provider === bot.modelProvider && entry.id === bot.modelId)
          ?.label ?? bot.modelId)
      : defaultLabel);
  const effort = chatModelEffort(bot, metadata?.me, metadata?.credentials ?? [], catalog);
  const effortOptions = [
    {
      value: "",
      label: effort.defaultLevel
        ? t`Default (${thinkingLevelLabel(effort.defaultLevel)})`
        : t`Default`,
    },
    ...effort.levels.map((level) => ({ value: level, label: thinkingLevelLabel(level) })),
  ];

  async function save(patch: Partial<Pick<Bot, "modelProvider" | "modelId" | "thinkingLevel">>) {
    if (disabled || saving.current || !metadata) return;
    saving.current = true;
    setBusy(true);
    onBusyChange(true);
    setError(null);
    try {
      const updated = await rpc.bots.update({
        botId: bot.id,
        ...patch,
      });
      onUpdated(updated);
    } catch (reason) {
      setError(errorText(reason, t`Could not save`));
    } finally {
      saving.current = false;
      setBusy(false);
      onBusyChange(false);
    }
  }

  async function choose(key: string) {
    if (key === value || (key ? !choices.some((choice) => choice.key === key) : !defaultModel))
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

  return (
    <div data-testid="thread-model-picker" className="mt-2 min-w-0">
      <div className="flex min-w-0 flex-wrap items-center gap-1">
        <Select
          value={value}
          items={options}
          disabled={disabled || busy || !metadata}
          onOpenChange={(open) => {
            if (open) void load();
          }}
          onValueChange={(next) => {
            if (next !== null) void choose(next);
          }}
        >
          <SelectTrigger
            aria-label={t`Model`}
            size="sm"
            className="max-w-full border-0 bg-transparent text-[12.5px] text-muted-foreground shadow-none"
          >
            <SelectValue>{metadata ? currentLabel : t`Model`}</SelectValue>
          </SelectTrigger>
          <SelectContent
            side="top"
            align="start"
            alignItemWithTrigger={false}
            className="max-h-72 w-auto max-w-[calc(100vw-2rem)] min-w-56"
          >
            {options.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {effort.levels.length > 0 ? (
          <Select
            value={effort.value ?? ""}
            items={effortOptions}
            disabled={disabled || busy || !metadata}
            onValueChange={(next) => {
              if (next !== null) void chooseEffort(next);
            }}
          >
            <SelectTrigger
              aria-label={t`Reasoning effort`}
              size="sm"
              className="max-w-full border-0 bg-transparent text-[12.5px] text-muted-foreground shadow-none"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent
              side="top"
              align="start"
              alignItemWithTrigger={false}
              className="w-auto min-w-40"
            >
              {effortOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}
      </div>
      {error ? (
        <div role="alert" className="mt-1 flex items-center gap-2 text-[12.5px] text-destructive">
          {error}
          <Button variant="link" size="xs" onClick={() => void load()}>
            <Trans>Retry</Trans>
          </Button>
        </div>
      ) : null}
    </div>
  );
}
