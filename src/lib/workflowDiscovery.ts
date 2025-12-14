import * as vscode from "vscode";

export type BmadWorkflow = {
  /** e.g. "brainstorming-session" from workflow.md frontmatter */
  name: string;
  description: string;
  /** fs path to workflow.md */
  workflowMdPath: string;
  /** directory containing workflow.md */
  workflowDir: string;
};

export async function discoverBmadWorkflows(): Promise<BmadWorkflow[]> {
  // BMAD installs into `_bmad/core/workflows/**/workflow.md` by default.
  // We also include module workflows if present.
  const uris = await vscode.workspace.findFiles(
    "{**/_bmad/**/workflows/**/workflow.md,**/_bmad/**/workflows/**/workflow.mdx}",
    "**/node_modules/**"
  );

  const workflows: BmadWorkflow[] = [];
  for (const uri of uris) {
    try {
      const doc = await vscode.workspace.openTextDocument(uri);
      const parsed = parseFrontmatter(doc.getText());
      const name = String(parsed.name ?? "").trim();
      if (!name) continue;
      const description = String(parsed.description ?? "").trim();
      workflows.push({
        name,
        description,
        workflowMdPath: uri.fsPath,
        workflowDir: vscode.Uri.joinPath(uri, "..").fsPath,
      });
    } catch {
      // ignore broken workflow files
    }
  }

  workflows.sort((a, b) => a.name.localeCompare(b.name));
  return dedupeByName(workflows);
}

function dedupeByName(workflows: BmadWorkflow[]): BmadWorkflow[] {
  const map = new Map<string, BmadWorkflow>();
  for (const w of workflows) {
    if (!map.has(w.name)) map.set(w.name, w);
  }
  return [...map.values()];
}

function parseFrontmatter(markdown: string): Record<string, string> {
  // Minimal YAML-frontmatter parser: expects first `---` block at file start.
  const lines = markdown.split(/\r?\n/);
  if (lines[0]?.trim() !== "---") return {};
  let end = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i]?.trim() === "---") {
      end = i;
      break;
    }
  }
  if (end < 0) return {};

  const fm: Record<string, string> = {};
  for (let i = 1; i < end; i++) {
    const raw = lines[i] ?? "";
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const idx = line.indexOf(":");
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim();
    let val = line.slice(idx + 1).trim();
    // strip inline comments
    const hash = val.indexOf(" #");
    if (hash >= 0) val = val.slice(0, hash).trim();
    // strip quotes
    val = val.replace(/^['"]|['"]$/g, "");
    fm[key] = val;
  }
  return fm;
}

