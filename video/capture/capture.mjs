// Deterministic frame capture of Ryu's demo: fake clock + stepped CSS animations.
import { chromium } from "playwright";
import fs from "node:fs";
const [, , OUT = "frames", DSF = "1.5", W = "1920", H = "1080", MAXF = "3200", SKIP = "0"] = process.argv;
fs.mkdirSync(OUT, { recursive: true });
const log = (...a) => fs.appendFileSync(`${OUT}/log.txt`, a.join(" ") + "\n");
const browser = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--force-color-profile=srgb"] });
const page = await browser.newPage({ viewport: { width: +W, height: +H }, deviceScaleFactor: +DSF });
page.on("pageerror", (e) => log("PAGEERROR", e.message));
await page.addInitScript(() => {
  window.__frame = 0; window.__sfx = [];
  // Record every UI tone the app synthesizes, with the frame it happened on.
  const orig = AudioContext.prototype.createOscillator;
  AudioContext.prototype.createOscillator = function () {
    const o = orig.call(this); const rec = { frame: window.__frame, type: "sine", freq: 0, at: 0 };
    const sv = o.frequency.setValueAtTime.bind(o.frequency);
    o.frequency.setValueAtTime = (f, t) => { rec.freq = f; rec.at = Math.max(0, t - this.currentTime); return sv(f, t); };
    Object.defineProperty(o, "type", { set(v) { rec.type = v; }, get() { return rec.type; } });
    window.__sfx.push(rec); return o;
  };
  window.__step = (dt) => {
    for (const a of document.getAnimations()) {
      if (a.__t === undefined) { a.__t = 0; a.pause(); }
      a.__t += dt; a.currentTime = a.__t;
    }
  };
});
await page.clock.install({ time: new Date("2026-09-28T09:40:59+05:30") });
await page.clock.pauseAt(new Date("2026-09-28T09:41:00+05:30")); // time only moves when we tick
await page.goto("http://localhost:8081/?demo", { timeout: 180000 });
const cdp = await page.context().newCDPSession(page);
const dt = 1000 / 30;
let f = 0; const marks = {}; const clicks = [];
const t0 = Date.now();
async function tick(n = 1) {
  for (let i = 0; i < n; i++) {
    if (f >= +MAXF) throw new Error(`frame cap ${MAXF} reached`);
    await page.evaluate((fr) => { window.__frame = fr; }, f);
    await page.clock.runFor(dt);
    await page.evaluate((d) => window.__step(d), dt);
    if (f >= +SKIP) {
      const { data } = await cdp.send("Page.captureScreenshot", { format: "jpeg", quality: 93, optimizeForSpeed: true });
      fs.writeFileSync(`${OUT}/f${String(f).padStart(5, "0")}.jpg`, Buffer.from(data, "base64"));
    }
    f++;
    if (f % 30 === 0) log(`frame ${f} · ${((Date.now() - t0) / f / 1000).toFixed(2)} s/frame`);
  }
}
const has = (sel) => page.evaluate((s) => !!document.querySelector(s), sel);
const hasText = (t) => page.evaluate((t) => document.body.innerText.toLowerCase().includes(t.toLowerCase()), t);
async function until(pred, max, label) {
  for (let i = 0; i < max; i += 5) { if (await pred()) { log("ready", label, f); return; } await tick(5); }
  throw new Error(`timeout waiting for ${label}`);
}
async function clickAt(getBox, label) {
  const b = await page.evaluate(getBox);
  if (!b) throw new Error(`no element for ${label}`);
  const x = b.x + b.w / 2, y = b.y + b.h / 2;
  marks[label] = f; clicks.push({ frame: f, x, y, label });
  await page.mouse.move(x, y); await page.mouse.down(); await tick(3); await page.mouse.up();
  log("click", label, f, x, y);
}
const byTestId = (id) => new Function(`const e=document.querySelector('[data-testid="${id}"]');if(!e)return null;const r=e.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height};`);
const byText = (txt, n = 0) => new Function(`const els=[...document.querySelectorAll("div,span")].filter(e=>e.childElementCount===0&&e.textContent.trim().toLowerCase()===${JSON.stringify(txt.toLowerCase())});const e=els[${n}];if(!e)return null;let c=e;for(let i=0;i<6&&c;i++){if(getComputedStyle(c).cursor==="pointer")break;c=c.parentElement}const r=(c||e).getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height};`);

try {
  marks.boot = 0;
  await until(() => has('[data-testid="enter"]'), 600, "enter");
  await tick(50);
  await clickAt(byTestId("enter"), "enter");
  await tick(100);
  marks.voice = f;
  await clickAt(byTestId("demo-voice"), "demoVoice");
  await until(() => has('[data-testid="stop"]'), 450, "meeting");
  marks.meeting = f;
  await until(() => hasText("SYSTEM ANALYSIS") || hasText("System analysis"), 1500, "processing");
  marks.processing = f;
  await until(() => hasText("MEETING · CORE") || hasText("Meeting · core"), 900, "notes");
  marks.notes = f;
  await tick(240); // voice brief plays
  await clickAt(byText("YOU"), "youCard");
  marks.youNote = f;
  await tick(210);
  await page.keyboard.press("Escape"); marks.closeYou = f; await tick(30);
  await clickAt(byText("PRIYA"), "priyaCard");
  marks.priyaNote = f;
  await tick(150);
  await page.keyboard.press("Escape"); marks.closePriya = f; await tick(24);
  await clickAt(byText("TRANSCRIPT"), "transcript");
  marks.transcript = f;
  await tick(150);
  marks.end = f;
} catch (e) { log("ERROR", e.message); }
const sfx = await page.evaluate(() => window.__sfx);
fs.writeFileSync(`${OUT}/meta.json`, JSON.stringify({ fps: 30, frames: f, width: +W, height: +H, dsf: +DSF, marks, clicks, sfx }, null, 1));
log("DONE", f, "frames in", ((Date.now() - t0) / 60000).toFixed(1), "min");
await browser.close();
