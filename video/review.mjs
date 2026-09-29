// Contact-sheet review: bundle once, render chosen frames at half scale.
import { bundle } from "@remotion/bundler";
import { renderStill, selectComposition } from "@remotion/renderer";
import path from "node:path";
const frames = process.argv.slice(2).map(Number);
const browserExecutable = process.env.RYU_BROWSER;
const serveUrl = await bundle({ entryPoint: path.resolve("src/index.ts") });
const composition = await selectComposition({ serveUrl, id: "RyuFeature", browserExecutable });
for (const frame of frames) {
  await renderStill({ serveUrl, composition, frame, output: `out/review/r${String(frame).padStart(5, "0")}.jpg`, imageFormat: "jpeg", jpegQuality: 85, scale: 0.5, browserExecutable });
  console.log("rendered", frame);
}
