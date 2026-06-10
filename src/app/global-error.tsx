"use client";

import { useEffect } from "react";

// Last-resort boundary that wraps the root layout itself. When this
// fires, even the AppShell may have failed — render a minimal screen
// without depending on the brutalist design tokens.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[doodaboo] global error", error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          fontFamily: "ui-monospace, Menlo, monospace",
          background: "#fafaf7",
          color: "#0a0a0a",
          margin: 0,
          padding: "10vh 24px",
          minHeight: "100vh",
        }}
      >
        <div
          style={{
            maxWidth: 480,
            margin: "0 auto",
            border: "1.5px solid #0a0a0a",
            background: "#fafaf7",
            boxShadow: "4px 4px 0 0 #0a0a0a",
          }}
        >
          <div
            style={{
              borderBottom: "1.5px solid #0a0a0a",
              padding: "10px 12px",
              fontSize: 11,
              textTransform: "uppercase",
              letterSpacing: 2,
              fontWeight: 700,
            }}
          >
            Fatal error
          </div>
          <div style={{ padding: 16 }}>
            <div style={{ fontSize: 36, fontWeight: 700, lineHeight: 1 }}>
              ERR
            </div>
            <p style={{ marginTop: 12, fontSize: 14 }}>
              The app couldn&apos;t render. Try reloading.
            </p>
            <button
              onClick={reset}
              style={{
                marginTop: 16,
                height: 36,
                padding: "0 12px",
                border: "1.5px solid #0a0a0a",
                background: "#ff5c1a",
                fontFamily: "inherit",
                fontSize: 11,
                textTransform: "uppercase",
                letterSpacing: 2,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              Try again
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
