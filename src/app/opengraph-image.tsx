import { ImageResponse } from "next/og";

// Static OG image generated at build time. 1200x630 is the canonical OG size
// and renders correctly across X, LinkedIn, Slack, iMessage, and Discord.
export const runtime = "edge";
export const alt = "Doodaboo — Project OS";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OGImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          background: "#fafaf7",
          color: "#0a0a0a",
          fontFamily: "ui-monospace, Menlo, Consolas, monospace",
          padding: 64,
          position: "relative",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            backgroundImage:
              "linear-gradient(to right, rgba(10,10,10,0.06) 1px, transparent 1px), linear-gradient(to bottom, rgba(10,10,10,0.06) 1px, transparent 1px)",
            backgroundSize: "32px 32px",
          }}
        />
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 18,
            zIndex: 1,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 64,
              height: 64,
              background: "#0a0a0a",
              color: "#fafaf7",
              border: "3px solid #0a0a0a",
              fontSize: 36,
              fontWeight: 700,
            }}
          >
            D
          </div>
          <div
            style={{
              fontSize: 22,
              textTransform: "uppercase",
              letterSpacing: 4,
              fontWeight: 700,
              opacity: 0.7,
            }}
          >
            Doodaboo · project.os
          </div>
        </div>
        <div
          style={{
            marginTop: 110,
            fontSize: 96,
            fontWeight: 800,
            lineHeight: 1.05,
            letterSpacing: -2,
            zIndex: 1,
            display: "flex",
            flexDirection: "column",
          }}
        >
          <span>Brutalist project OS</span>
          <span style={{ color: "#ff5c1a" }}>+ virality predictor.</span>
        </div>
        <div
          style={{
            marginTop: "auto",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-end",
            zIndex: 1,
            fontSize: 22,
          }}
        >
          <div
            style={{
              display: "flex",
              gap: 12,
              flexWrap: "wrap",
              maxWidth: 760,
            }}
          >
            {[
              "Projects",
              "Issues",
              "Kanban",
              "8 platforms",
              "Live scoring",
              "Playbooks",
              "Insights",
              "Compare",
            ].map((tag) => (
              <span
                key={tag}
                style={{
                  display: "flex",
                  border: "2px solid #0a0a0a",
                  padding: "6px 12px",
                  background: "#fafaf7",
                  textTransform: "uppercase",
                  letterSpacing: 2,
                  fontSize: 18,
                }}
              >
                {tag}
              </span>
            ))}
          </div>
          <div
            style={{
              border: "3px solid #0a0a0a",
              background: "#c4f000",
              padding: "18px 26px",
              fontSize: 28,
              fontWeight: 800,
              letterSpacing: 3,
              textTransform: "uppercase",
              boxShadow: "8px 8px 0 0 #0a0a0a",
              display: "flex",
            }}
          >
            v0.1
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}
