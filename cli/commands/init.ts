import { initVault, vaultExists } from "../../src/lib/vault.js";
import { parseArgs } from "../util.js";

export async function runInit(argv: string[]): Promise<number> {
  const { values, positionals } = parseArgs<{ force?: boolean }>(argv, {
    force: { type: "boolean" },
  });
  const root = positionals[0] ?? values.vault;
  const exists = await vaultExists(root);
  if (exists && !values.force) {
    process.stderr.write(
      `A vault already exists at ${root ?? "~/.doodaboo"}. Pass --force to overwrite.\n`,
    );
    return 1;
  }
  const paths = await initVault(root, { force: values.force });
  if (values.json) {
    process.stdout.write(`${JSON.stringify(paths, null, 2)}\n`);
  } else {
    process.stdout.write(
      `Vault created at ${paths.root}\n  workspace: ${paths.workspaceFile}\n  backups:   ${paths.backupsDir}\n  plugins:   ${paths.pluginsDir}\n  exports:   ${paths.exportsDir}\n`,
    );
  }
  return 0;
}
