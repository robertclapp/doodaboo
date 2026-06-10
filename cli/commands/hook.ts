import { generateHooks, variantsForPlatform } from "../../src/lib/hooks-generator.js";
import { Platform } from "../../src/lib/types.js";
import { parseArgs, fail, row } from "../util.js";

export async function runHook(argv: string[]): Promise<number> {
  const sub = argv[0];
  const rest = argv.slice(1);
  if (sub !== "generate" && sub !== undefined) {
    fail(`Unknown hook subcommand: ${sub}.`);
  }
  const { values, positionals } = parseArgs<{
    platform?: string;
    audience?: string;
    family?: string;
  }>(rest, {
    platform: { type: "string", short: "p" },
    audience: { type: "string", short: "a" },
    family: { type: "string", short: "f" },
  });
  const subject = positionals.join(" ");
  if (!subject) fail("Provide a subject: doodaboo hook generate \"pricing pages\"");

  const all = generateHooks({ subject, audience: values.audience });
  const platform = (values.platform ?? "all") as Platform | "all";
  const filtered = variantsForPlatform(all, platform).filter(
    (v) => !values.family || v.template.family === values.family,
  );

  if (values.json) {
    process.stdout.write(`${JSON.stringify(filtered, null, 2)}\n`);
    return 0;
  }
  if (filtered.length === 0) {
    process.stdout.write("No variants for those filters.\n");
    return 0;
  }
  process.stdout.write(`${row("FAMILY", "HOOK")}\n`);
  for (const v of filtered) {
    process.stdout.write(`${row(v.template.family, v.hook)}\n`);
  }
  return 0;
}
