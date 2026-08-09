import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import { buildPremieregalShowcaseTree } from "@/lib/premieregal-showcase-catalog";

/**
 * Native port of Laravel `App\Http\Controllers\ShowcaseController::getShowcase`,
 * including the helpers `getLeafNodes`, `collectLeavesByParentFolder`,
 * `pickLeavesRoundRobinDiverse` and `ensureUniqueMediaLeaves`.
 *
 * Prefer the live R2 catalog under
 * `premieregal/gal-toolkit-max-pr/Gal Toolkit Max Preview Assets/`.
 * Fall back to `public/lib/tree.json` if R2 is unavailable.
 */

export interface TreeNode {
    name?: string;
    media?: string;
    children?: TreeNode[];
    [key: string]: unknown;
}

interface CachedFileTree {
    mtimeMs: number;
    tree: TreeNode[];
}

let fileCache: CachedFileTree | null = null;

function treeJsonPath(): string {
    return path.join(process.cwd(), "public", "lib", "tree.json");
}

async function loadTreeFromFile(): Promise<TreeNode[]> {
    const file = treeJsonPath();
    const stat = await fs.stat(file);
    if (fileCache && fileCache.mtimeMs === stat.mtimeMs) return fileCache.tree;
    const raw = await fs.readFile(file, "utf8");
    const parsed = JSON.parse(raw) as TreeNode[];
    fileCache = { mtimeMs: stat.mtimeMs, tree: parsed };
    return parsed;
}

const R2_JSON_PATH =
    "r2:premieregal/gal-toolkit-max-pr/Gal Toolkit Max Preview Assets/";

/** Full showcase tree from R2 (preferred) or local `tree.json` fallback. */
export async function loadShowcaseTree(): Promise<{
    tree: TreeNode[];
    jsonPath: string;
}> {
    try {
        const tree = await buildPremieregalShowcaseTree();
        if (tree.length > 0) {
            return { tree: tree as TreeNode[], jsonPath: R2_JSON_PATH };
        }
    } catch (err) {
        console.error("[showcase-tree] R2 catalog failed, using tree.json", err);
    }
    return { tree: await loadTreeFromFile(), jsonPath: treeJsonPath() };
}

/** Port of `getLeafNodes` (PHP) — depth-first traversal collecting leaves. */
export function getLeafNodes(node: TreeNode): TreeNode[] {
    const out: TreeNode[] = [];
    const traverse = (n: TreeNode) => {
        const children = n.children ?? [];
        if (children.length === 0) {
            out.push(n);
            return;
        }
        for (const child of children) traverse(child);
    };
    traverse(node);
    return out;
}

interface TaggedLeaf {
    node: TreeNode;
    subgroup: string;
}

/**
 * Port of `collectLeavesByParentFolder`. When `subgroupTopLevelOnly` is true
 * the subgroup key is just the first folder under the section, so previews
 * spread across transition families instead of clustering inside one family.
 */
export function collectLeavesByParentFolder(
    sectionTree: TreeNode,
    subgroupTopLevelOnly = false,
): TaggedLeaf[] {
    const out: TaggedLeaf[] = [];
    const visit = (node: TreeNode, pathToFolder: string[]) => {
        const children = node.children ?? [];
        if (children.length === 0) return;

        const allImmediateLeaves = children.every((c) => !c.children || c.children.length === 0);
        if (allImmediateLeaves) {
            const key = subgroupTopLevelOnly
                ? String(pathToFolder[0] ?? "")
                : pathToFolder.join("/");
            for (const leaf of children) out.push({ node: leaf, subgroup: key });
            return;
        }
        for (const child of children) {
            const name = String(child.name ?? "");
            visit(child, [...pathToFolder, name]);
        }
    };
    for (const top of sectionTree.children ?? []) {
        visit(top, [String(top.name ?? "")]);
    }
    return out;
}

function shuffleInPlace<T>(arr: T[]): T[] {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

/**
 * Port of `pickLeavesRoundRobinDiverse`: take up to `limit` items, at most one
 * per subgroup per round (then fill from a shuffled remainder).
 */
export function pickLeavesRoundRobinDiverse(
    bySubgroup: Record<string, TreeNode[]>,
    limit: number,
): TreeNode[] {
    const keys = shuffleInPlace(Object.keys(bySubgroup));
    const picked: TreeNode[] = [];
    const pos: Record<string, number> = {};
    for (const k of keys) pos[k] = 0;

    while (picked.length < limit) {
        let added = false;
        for (const k of keys) {
            if (picked.length >= limit) break;
            if (pos[k] < bySubgroup[k].length) {
                picked.push(bySubgroup[k][pos[k]]);
                pos[k] += 1;
                added = true;
            }
        }
        if (!added) break;
    }

    if (picked.length < limit) {
        const rest: TreeNode[] = [];
        for (const k of keys) {
            while (pos[k] < bySubgroup[k].length) {
                rest.push(bySubgroup[k][pos[k]]);
                pos[k] += 1;
            }
        }
        shuffleInPlace(rest);
        const need = limit - picked.length;
        picked.push(...rest.slice(0, need));
    }

    return picked;
}

/** Port of `ensureUniqueMediaLeaves` — dedupe by media, top up from candidates. */
export function ensureUniqueMediaLeaves(
    picked: TreeNode[],
    candidates: TreeNode[],
    limit: number,
): TreeNode[] {
    const seen = new Set<string>();
    const out: TreeNode[] = [];
    for (const n of picked) {
        const m = String(n.media ?? "");
        if (m === "" || seen.has(m)) continue;
        seen.add(m);
        out.push(n);
        if (out.length >= limit) return out;
    }

    const pool = [...candidates];
    shuffleInPlace(pool);
    for (const n of pool) {
        if (out.length >= limit) break;
        const m = String(n.media ?? "");
        if (m === "" || seen.has(m)) continue;
        seen.add(m);
        out.push(n);
    }
    return out;
}

export interface ShowcaseResult {
    items: string[];
    jsonPath: string;
}

const SHOWCASE_LIMIT = 12;

/**
 * Top-level helper used by `/api/get-galtoolkit-showcase` — returns the same
 * shape Laravel emitted (`{ items, jsonPath }`) or `null` if the section is
 * not present in the tree.
 */
export async function getShowcaseForSection(section: string): Promise<ShowcaseResult | null> {
    const { tree, jsonPath } = await loadShowcaseTree();
    const sectionTree = tree.find((item) => item.name === section);
    if (!sectionTree) return null;

    let leafNodes: TreeNode[];

    if (section === "Transitions") {
        const tagged = collectLeavesByParentFolder(sectionTree, true);
        const bySubgroup: Record<string, TreeNode[]> = {};
        for (const row of tagged) {
            if (row.subgroup === "") continue;
            (bySubgroup[row.subgroup] ??= []).push(row.node);
        }
        for (const k of Object.keys(bySubgroup)) shuffleInPlace(bySubgroup[k]);

        const initial = pickLeavesRoundRobinDiverse(bySubgroup, SHOWCASE_LIMIT);
        leafNodes = ensureUniqueMediaLeaves(initial, getLeafNodes(sectionTree), SHOWCASE_LIMIT);
        shuffleInPlace(leafNodes);
    } else {
        leafNodes = getLeafNodes(sectionTree);
        shuffleInPlace(leafNodes);
        leafNodes = leafNodes.slice(0, SHOWCASE_LIMIT);
    }

    const items = leafNodes
        .map((leaf) => (typeof leaf.media === "string" ? leaf.media : ""))
        .filter((m): m is string => m.length > 0);

    return { items, jsonPath };
}
