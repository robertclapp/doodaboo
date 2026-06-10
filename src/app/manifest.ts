import { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Doodaboo — Project OS",
    short_name: "Doodaboo",
    description:
      "Brutalist project OS. Projects, issues, kanban, plus a multi-platform virality predictor.",
    start_url: "/",
    display: "standalone",
    orientation: "portrait-primary",
    background_color: "#fafaf7",
    theme_color: "#fafaf7",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/apple-icon.png", sizes: "180x180", type: "image/png" },
    ],
    categories: ["productivity", "business"],
  };
}
