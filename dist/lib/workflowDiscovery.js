"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.discoverBmadWorkflows = discoverBmadWorkflows;
const vscode = __importStar(require("vscode"));
async function discoverBmadWorkflows() {
    // BMAD installs into `_bmad/core/workflows/**/workflow.md` by default.
    // We also include module workflows if present.
    const uris = await vscode.workspace.findFiles("{**/_bmad/**/workflows/**/workflow.md,**/_bmad/**/workflows/**/workflow.mdx}", "**/node_modules/**");
    const workflows = [];
    for (const uri of uris) {
        try {
            const doc = await vscode.workspace.openTextDocument(uri);
            const parsed = parseFrontmatter(doc.getText());
            const name = String(parsed.name ?? "").trim();
            if (!name)
                continue;
            const description = String(parsed.description ?? "").trim();
            workflows.push({
                name,
                description,
                workflowMdPath: uri.fsPath,
                workflowDir: vscode.Uri.joinPath(uri, "..").fsPath,
            });
        }
        catch {
            // ignore broken workflow files
        }
    }
    workflows.sort((a, b) => a.name.localeCompare(b.name));
    return dedupeByName(workflows);
}
function dedupeByName(workflows) {
    const map = new Map();
    for (const w of workflows) {
        if (!map.has(w.name))
            map.set(w.name, w);
    }
    return [...map.values()];
}
function parseFrontmatter(markdown) {
    // Minimal YAML-frontmatter parser: expects first `---` block at file start.
    const lines = markdown.split(/\r?\n/);
    if (lines[0]?.trim() !== "---")
        return {};
    let end = -1;
    for (let i = 1; i < lines.length; i++) {
        if (lines[i]?.trim() === "---") {
            end = i;
            break;
        }
    }
    if (end < 0)
        return {};
    const fm = {};
    for (let i = 1; i < end; i++) {
        const raw = lines[i] ?? "";
        const line = raw.trim();
        if (!line || line.startsWith("#"))
            continue;
        const idx = line.indexOf(":");
        if (idx <= 0)
            continue;
        const key = line.slice(0, idx).trim();
        let val = line.slice(idx + 1).trim();
        // strip inline comments
        const hash = val.indexOf(" #");
        if (hash >= 0)
            val = val.slice(0, hash).trim();
        // strip quotes
        val = val.replace(/^['"]|['"]$/g, "");
        fm[key] = val;
    }
    return fm;
}
