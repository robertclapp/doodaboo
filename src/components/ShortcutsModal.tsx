"use client";

import { Modal } from "./ui/Modal";

const SHORTCUTS: { group: string; items: [string, string][] }[] = [
  {
    group: "Global",
    items: [
      ["⌘ K", "Open command palette"],
      ["C", "Create a new issue"],
      ["?", "Open this shortcuts sheet"],
      ["Esc", "Close modal or palette"],
    ],
  },
  {
    group: "Command palette",
    items: [
      ["↑ ↓", "Navigate results"],
      ["↩", "Run highlighted command"],
    ],
  },
  {
    group: "New issue modal",
    items: [
      ["⌘ ↩", "Create issue"],
      ["Esc", "Cancel"],
    ],
  },
];

export function ShortcutsModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  return (
    <Modal open={open} onClose={onClose} title="Keyboard shortcuts" widthClass="max-w-lg">
      <div className="flex flex-col gap-5">
        {SHORTCUTS.map((section) => (
          <section key={section.group}>
            <div className="font-mono text-[10px] uppercase tracking-widest text-ink/50 mb-2">
              {section.group}
            </div>
            <ul className="border-[1.5px] border-ink bg-paper">
              {section.items.map(([key, label]) => (
                <li
                  key={key}
                  className="flex items-center justify-between h-8 px-3 border-b-[1.5px] border-ink/10 last:border-b-0"
                >
                  <span className="text-sm">{label}</span>
                  <Keycap>{key}</Keycap>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </Modal>
  );
}

function Keycap({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1">
      {String(children)
        .split(" ")
        .map((k, i) => (
          <kbd
            key={i}
            className="font-mono text-[10px] uppercase tracking-wider bg-ink text-paper px-1.5 h-5 inline-flex items-center"
          >
            {k}
          </kbd>
        ))}
    </span>
  );
}
