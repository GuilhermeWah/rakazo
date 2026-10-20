import { expect, test } from "@playwright/test";
import {
  activeBotId,
  captureScreenshot,
  chooseOption,
  completeOnboarding,
  rpc,
  signup,
} from "./helpers";

test("switches the conversation model per bot and preserves its draft and space default", async ({
  page,
}, testInfo) => {
  await signup(page, `chat-model-${Date.now()}@rakazo.test`, "password12", "Model Switch");
  await completeOnboarding(page);
  await page.goto("/app");
  await page.waitForURL(/\/app\/[^/]+$/);
  const chiefId = activeBotId(page);
  const peer = await rpc<{ id: string }>(page, "bots/create", {
    name: "Researcher",
    title: "",
    description: "",
    instructions: "",
    notifyOnFinish: true,
  });
  await rpc(page, "models/connect", {
    provider: "openai-compatible",
    label: "Local fixture",
    baseUrl: "http://127.0.0.1:8888/v1",
    apiKey: "fake-model-key",
    modelId: "local-small",
    enabledModelIds: ["local-small", "local-large", "local-previous"],
    reasoning: true,
  });
  const defaultBefore = await rpc<{ defaultProvider: string; defaultModel: string }>(page, "me");
  await page.reload();
  const picker = page.getByTestId("thread-model-picker");
  const model = picker.getByRole("combobox", { name: "Model", exact: true });
  const composer = page.getByRole("combobox", { name: "Message Chief" });
  await expect(model).toBeEnabled();
  await composer.fill("Keep this draft while changing models");
  await captureScreenshot(page, testInfo, "chat-model-default");
  let release!: () => void;
  const saveGate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/rpc/bots/update", async (route) => {
    await saveGate;
    await route.continue();
  });
  await model.click();
  await expect(
    page.getByRole("option", { name: "Local fixture · local-large", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("option", { name: /local-previous/ })).toHaveCount(1);
  await expect(page.getByRole("option")).toHaveCount(4);
  await captureScreenshot(page, testInfo, "chat-model-menu");
  await page.getByRole("option", { name: "Local fixture · local-large", exact: true }).click();
  await expect(model).toBeDisabled();
  await expect(page.getByRole("button", { name: "Send", exact: true })).toBeDisabled();
  await page.getByText("Researcher", { exact: true }).click();
  await expect(page.getByRole("combobox", { name: "Message Researcher" })).toBeVisible();
  await expect(model).toBeDisabled();
  await page.getByText("Chief", { exact: true }).click();
  await expect(composer).toBeVisible();
  await expect(model).toBeDisabled();
  release();
  await expect(model).toHaveText("Local fixture · local-large");
  await expect(model).toBeEnabled();
  await expect(composer).toHaveValue("Keep this draft while changing models");
  await expect(page.getByRole("button", { name: "Send", exact: true })).toBeEnabled();
  await page.unroute("**/rpc/bots/update");
  const bots = await rpc<
    Array<{ id: string; modelProvider: string | null; modelId: string | null }>
  >(page, "bots/list");
  expect(bots.find((bot) => bot.id === chiefId)).toMatchObject({
    modelProvider: "openai-compatible",
    modelId: "local-large",
  });
  expect(bots.find((bot) => bot.id === peer.id)).toMatchObject({
    modelProvider: null,
    modelId: null,
  });
  const defaultAfter = await rpc<{ defaultProvider: string; defaultModel: string }>(page, "me");
  expect([defaultAfter.defaultProvider, defaultAfter.defaultModel]).toEqual([
    defaultBefore.defaultProvider,
    defaultBefore.defaultModel,
  ]);
  const effort = picker.getByRole("combobox", { name: "Reasoning effort", exact: true });
  await expect(effort).toBeVisible();
  await effort.click();
  await expect(page.getByRole("option", { name: "High", exact: true })).toBeVisible();
  await captureScreenshot(page, testInfo, "chat-effort-menu");
  await page.getByRole("option", { name: "High", exact: true }).click();
  await expect(effort).toHaveText("High");
  const effortBots = await rpc<Array<{ id: string; thinkingLevel: string | null }>>(
    page,
    "bots/list",
  );
  expect(effortBots.find((bot) => bot.id === chiefId)?.thinkingLevel).toBe("high");
  expect(effortBots.find((bot) => bot.id === peer.id)?.thinkingLevel).toBeNull();
  await page.reload();
  await expect(model).toHaveText("Local fixture · local-large");
  await expect(effort).toHaveText("High");
  await captureScreenshot(page, testInfo, "chat-model-selected");
  await page.route("**/rpc/bots/update", (route) =>
    route.fulfill({ status: 500, json: { message: "Fixture save failure" } }),
  );
  await chooseOption(model, "Local fixture · local-small");
  await expect(picker.getByRole("alert")).toBeVisible();
  await expect(model).toHaveText("Local fixture · local-large");
  await page.unroute("**/rpc/bots/update");
  await page.setViewportSize({ width: 390, height: 844 });
  await model.click();
  const inherited = page.getByRole("option").filter({ hasText: /^Space default/ });
  await inherited.click();
  await expect(model).toContainText("Space default");
  const resetBots = await rpc<typeof bots>(page, "bots/list");
  expect(resetBots.find((bot) => bot.id === chiefId)).toMatchObject({
    modelProvider: null,
    modelId: null,
  });
  await captureScreenshot(page, testInfo, "chat-model-mobile");
});
