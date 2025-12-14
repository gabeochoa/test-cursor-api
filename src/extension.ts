import * as vscode from "vscode";
import { CursorCloudClient } from "./lib/cursorCloudClient";
import { discoverBmadWorkflows } from "./lib/workflowDiscovery";
import { BmadCloudPanel } from "./ui/panel";

let panel: BmadCloudPanel | undefined;

export async function activate(context: vscode.ExtensionContext) {
  const output = vscode.window.createOutputChannel("BMAD Cloud", { log: true });

  const setApiKeySecurely = async () => {
    const apiKey = await vscode.window.showInputBox({
      title: "Cursor Cloud Agents API Key",
      prompt: "Enter your Cursor Cloud Agents API key (stored securely).",
      password: true,
      ignoreFocusOut: true,
    });
    if (!apiKey) return;
    await context.secrets.store("bmadCloud.apiKey", apiKey);
    output.info("Stored API key in secure storage.");
  };

  const getClient = async () => {
    const cfg = vscode.workspace.getConfiguration("bmadCloud");
    const apiBaseUrl = String(cfg.get("apiBaseUrl") ?? "https://api.cursor.com");
    const configuredApiKey = String(cfg.get("apiKey") ?? "").trim();
    const storedApiKey = (await context.secrets.get("bmadCloud.apiKey"))?.trim();
    const apiKey = configuredApiKey || storedApiKey;

    if (!apiKey) {
      // Prompt as fallback, then store securely.
      const prompted = await vscode.window.showInputBox({
        title: "Cursor Cloud Agents API Key",
        prompt: "Enter your Cursor Cloud Agents API key (stored securely).",
        password: true,
        ignoreFocusOut: true,
      });
      if (!prompted) throw new Error("Missing API key.");
      await context.secrets.store("bmadCloud.apiKey", prompted);
      return new CursorCloudClient({ apiBaseUrl, apiKey: prompted });
    }

    return new CursorCloudClient({ apiBaseUrl, apiKey });
  };

  const openPanel = async () => {
    const workflows = await discoverBmadWorkflows();
    panel ??= new BmadCloudPanel(context, output, getClient);
    panel.show();
    await panel.setWorkflows(workflows);
  };

  context.subscriptions.push(
    vscode.commands.registerCommand("bmadCloud.openPanel", openPanel),
    vscode.commands.registerCommand("bmadCloud.setApiKey", setApiKeySecurely),
    vscode.commands.registerCommand("bmadCloud.runWorkflow", async () => {
      await openPanel();
      await panel?.runSelectedWorkflow();
    }),
    vscode.commands.registerCommand("bmadCloud.sendFollowup", async () => {
      await openPanel();
      await panel?.promptAndSendFollowup();
    }),
    vscode.commands.registerCommand("bmadCloud.stopRun", async () => {
      await openPanel();
      await panel?.stopActiveRun();
    })
  );

  // Auto-open panel once, but don't steal focus.
  setTimeout(() => {
    void openPanel().catch((err) => output.error(String(err)));
  }, 1500);
}

export function deactivate() {
  panel?.dispose();
  panel = undefined;
}

