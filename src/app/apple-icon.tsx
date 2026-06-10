import { ImageResponse } from "next/og";

export const runtime = "edge";
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "#fafaf7",
          color: "#0a0a0a",
          fontFamily: "ui-monospace, Menlo, monospace",
          fontWeight: 800,
        }}
      >
        <div
          style={{
            fontSize: 130,
            lineHeight: 1,
            background: "#0a0a0a",
            color: "#c4f000",
            padding: "8px 26px",
            border: "8px solid #0a0a0a",
            display: "flex",
          }}
        >
          D
        </div>
      </div>
    ),
    { ...size },
  );
}
