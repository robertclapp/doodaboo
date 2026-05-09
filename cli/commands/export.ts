import { promises as fs } from "node:fs";
import path from "node:path";
import { loadWorkspace, vaultPaths } from "../../src/lib/vault.js";
import { parseArgs, vaultRoot } from "../util.js";

export async function runExport(argv: string[]): Promise<number> {
  const { values, positionals } = parseArgs<{ markdown?: boolean }>(argv, {
    markdown: { type: "boolean", short: "m" },
  });
  const root = vaultRoot(values);
  const state = await loadWorkspace(root);

  if (values.markdown) {
    const dir = positionals[0] ?? path.join(vaultPaths(root).exportsDir, `markdown-${Date.now()}`);
    await fs.mkdir(dir, { recursive: true });
    await fs.mkdir(path.join(dir, "projects"), { recursive: true });
    await fs.mkdir(path.join(dir, "posts"), { recursive: true });

    for (const project of state.projects) {
      const tasks = state.tasks.filter((t) => t.projectId === project.id);
      const md = [
        `# ${project.name}`,
        ``,
        `> ${project.description || "_no description_"}`,
        ``,
        `- **key**: ${project.key}`,
        `- **status**: ${project.status}`,
        `- **priority**: ${project.priority}`,
        `- **lead**: ${project.leadId ?? "—"}`,
        `- **target date**: ${project.targetDate ?? "—"}`,
        ``,
        `## Tasks (${tasks.length})`,
        ``,
        ...tasks.map(
          (t) =>
            `- [${t.status === "done" ? "x" : " "}] **${project.key}-${t.number}** ${t.title} _(${t.status}, ${t.priority})_`,
        ),
        ``,
      ].join("\n");
      await fs.writeFile(
        path.join(dir, "projects", `${project.key}.md`),
        md,
        "utf-8",
      );
    }

    for (const post of state.posts) {
      const md = [
        `# ${post.title}`,
        ``,
        `- **platform**: ${post.platform}`,
        `- **format**: ${post.content.format}`,
        `- **status**: ${post.status}`,
        post.content.durationSec
          ? `- **duration**: ${post.content.durationSec}s`
          : "",
        ``,
        `## Hook`,
        ``,
        `> ${post.content.hook || "_empty_"}`,
        ``,
        `## Caption`,
        ``,
        post.content.caption || "_empty_",
        ``,
        `## Hashtags`,
        ``,
        post.content.hashtags.length
          ? post.content.hashtags.map((h) => `#${h}`).join(" ")
          : "_none_",
        ``,
        `## Snapshots (${post.snapshots.length})`,
        ``,
        post.snapshots.length === 0
          ? "_no engagement data captured yet_"
          : [
              "| t+min | views | likes | shares | saves | retention |",
              "|------:|------:|------:|------:|------:|---------:|",
              ...post.snapshots.map(
                (s) =>
                  `| ${s.atMinutes} | ${s.views} | ${s.likes} | ${s.shares} | ${s.saves} | ${s.retentionPct ?? "—"} |`,
              ),
            ].join("\n"),
        ``,
      ]
        .filter((l) => l !== "")
        .join("\n");
      await fs.writeFile(
        path.join(dir, "posts", `${post.id}.md`),
        md,
        "utf-8",
      );
    }
    process.stdout.write(`Markdown vault written to ${dir}\n`);
    return 0;
  }

  // JSON export
  const target =
    positionals[0] ??
    path.join(
      vaultPaths(root).exportsDir,
      `doodaboo-${new Date().toISOString().slice(0, 10)}.json`,
    );
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, JSON.stringify(state, null, 2), "utf-8");
  process.stdout.write(`Exported to ${target}\n`);
  return 0;
}
