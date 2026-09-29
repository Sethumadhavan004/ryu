import { AbsoluteFill, Html5Audio, interpolate, Sequence, staticFile, useCurrentFrame } from "remotion";
import captureMain from "./capture-main.json";
import { unmap } from "./camera";
import { Backdrop, Footage } from "./Footage";
import { C, F, easeOut, loadFonts } from "./theme";
import { Callout, Chapter, Cursor, Decode, DemoNote, Finish, Kinetic, presence, Target } from "./ui";

loadFonts();

export const FPS = 30;
export const DURATION = 2460; // 82 s — keep audio/make_audio.py section times in sync
const XF = 8; // crossfade frames between scenes

/**
 * Footage scenes: [global start, length, time remap (local → captured frame)].
 * Captured frame marks come from the capture log (src/capture-main.json):
 * enter 85 · voice 188 · meeting 291 · processing 1321 · notes 1631 · your note 1871
 * · close 2084 · Priya 2117 · end 2443.
 */
const SC = {
  boot: { at: 270, len: 135, pts: [[0, 0], [135, 130]] as [number, number][] },
  voice: { at: 405, len: 225, pts: [[0, 130], [58, 188], [225, 291]] as [number, number][] },
  meeting: { at: 630, len: 450, pts: [[0, 291], [90, 381], [200, 700], [250, 800], [370, 1110], [450, 1321]] as [number, number][] },
  analyse: { at: 1080, len: 270, pts: [[0, 1321], [270, 1631]] as [number, number][] },
  reveal: { at: 1350, len: 300, pts: [[0, 1631], [60, 1691], [300, 1856]] as [number, number][] },
  yours: { at: 1650, len: 270, pts: [[0, 1850], [24, 1874], [270, 2084]] as [number, number][] },
  priya: { at: 1920, len: 120, pts: [[0, 2098], [19, 2117], [120, 2230]] as [number, number][] },
};

/** Fade a scene in over its first XF frames (scenes overlap by XF). */
function SceneIn({ children }: { children: React.ReactNode }) {
  const f = useCurrentFrame();
  return <AbsoluteFill style={{ opacity: interpolate(f, [0, XF], [0, 1], { extrapolateRight: "clamp" }) }}>{children}</AbsoluteFill>;
}

const scene = (at: number, len: number, node: React.ReactNode, name: string) => (
  <Sequence key={name} name={name} from={at} durationInFrames={len + XF}>
    <SceneIn>{node}</SceneIn>
  </Sequence>
);

// ── 1 · Title ────────────────────────────────────────────────────────────────
function Title() {
  const f = useCurrentFrame();
  const line = easeOut((f - 52) / 30);
  return (
    <AbsoluteFill>
      <Backdrop frame={150} blur={26} brightness={0.42} drift={0.0006} />
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", gap: 28 }}>
        <div style={{ fontFamily: F.mono, fontSize: 20, letterSpacing: 4, color: C.systemHi, opacity: presence(f, 6, 150, 10, 12) }}>
          <Decode text="RYU.OS // LINK … OK" start={6} dur={22} seed="os" />
        </div>
        <div style={{ fontFamily: F.display, fontWeight: 700, fontSize: 210, letterSpacing: 60, marginRight: -60, color: C.ice, textShadow: `0 0 40px ${C.systemGlow}, 0 0 90px ${C.systemGlow}`, opacity: presence(f, 18, 150, 12, 12) }}>
          <Decode text="RYU" start={20} dur={26} seed="ryu" />
        </div>
        <div style={{ width: 720 * line, height: 1, background: `linear-gradient(90deg, transparent, ${C.system}, transparent)`, boxShadow: `0 0 12px ${C.systemGlow}` }} />
        <div style={{ fontFamily: F.display, fontWeight: 500, fontSize: 30, letterSpacing: 14, color: C.systemHi, opacity: presence(f, 60, 150, 16, 12) }}>
          VOICE-FIRST MEETING INTELLIGENCE
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
}

// ── 2 · Hook ─────────────────────────────────────────────────────────────────
function Hook() {
  const f = useCurrentFrame();
  return (
    <AbsoluteFill style={{ background: `radial-gradient(ellipse at 50% 60%, ${C.navy800} 0%, ${C.abyss} 70%)` }}>
      <AbsoluteFill style={{ opacity: 0.35, backgroundImage: `linear-gradient(${C.line}55 1px, transparent 1px), linear-gradient(90deg, ${C.line}55 1px, transparent 1px)`, backgroundSize: "64px 64px", maskImage: "radial-gradient(ellipse at center, black 20%, transparent 75%)" }} />
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", padding: 160 }}>
        <div style={{ position: "absolute", opacity: presence(f, 0, 62, 1, 12) }}>
          <Kinetic text="Every meeting ends with the same question." start={4} size={66} weight={500} font={F.body} spacing={0} />
        </div>
        <div style={{ position: "absolute", opacity: presence(f, 58, 128, 1, 10) }}>
          <Kinetic text="Who owes what — to whom?" start={60} size={104} stagger={5} highlight={{ what: C.gold, whom: C.systemHi }} />
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
}

// ── 3 · Boot ─────────────────────────────────────────────────────────────────
function Boot() {
  const click = unmap(85, SC.boot.pts)!;
  return (
    <Footage pts={SC.boot.pts} keys={[{ f: 0, s: 1.32, x: 960, y: 560 }, { f: 72, s: 1.32, x: 960, y: 580 }, { f: 110, s: 1, x: 960, y: 540 }]}>
      {(cam, f) => (
        <>
          <Target cam={cam} from={16} to={78} x={730} y={397} w={460} h={330} />
          <Callout from={20} to={100} x={70} y={330} width={500} tag="01" title="It wakes for real">
            The boot sequence <b style={{ color: C.ice }}>is</b> the connection. Each line reads ONLINE only once that service answers.
          </Callout>
          <Cursor x={960} y={801} clickAt={click} from={click - 26} to={click + 16} />
          <Chapter n="01" name="WAKE" from={4} to={135} />
          <DemoNote opacity={presence(f, 10, 135)} />
        </>
      )}
    </Footage>
  );
}

// ── 4 · Speak ────────────────────────────────────────────────────────────────
function Speak() {
  const click = unmap(188, SC.voice.pts)!;
  return (
    <Footage pts={SC.voice.pts} keys={[{ f: 0, s: 1, x: 960, y: 540 }, { f: 62, s: 1, x: 960, y: 540 }, { f: 108, s: 1.6, x: 960, y: 890 }, { f: 192, s: 1.6, x: 960, y: 890 }, { f: 224, s: 1, x: 960, y: 540 }]}>
      {(_cam, f) => (
        <>
          <Callout from={4} to={60} x={70} y={120} width={520} tag="02" title="Always listening">
            Open it and Ryu is already listening. Every voice command also has a button.
          </Callout>
          <Cursor x={1163} y={800} clickAt={click} from={click - 24} to={click + 16} />
          <Callout from={112} to={200} x={70} y={70} width={640} title="Just say it">
            “Start the meeting with Priya and Arjun.” The names you say become speaker labels later.
          </Callout>
          <Chapter n="02" name="SPEAK" from={0} to={225} />
          <DemoNote opacity={presence(f, 0, 225)} />
        </>
      )}
    </Footage>
  );
}

// ── 5 · Capture ──────────────────────────────────────────────────────────────
function Capture() {
  return (
    <Footage
      pts={SC.meeting.pts}
      keys={[
        { f: 0, s: 1.75, x: 918, y: 300 },
        { f: 72, s: 1.75, x: 918, y: 300 },
        { f: 104, s: 1, x: 960, y: 540 },
        { f: 116, s: 1, x: 960, y: 540 },
        { f: 150, s: 1.45, x: 470, y: 420 },
        { f: 206, s: 1.45, x: 470, y: 420 },
        { f: 240, s: 1.5, x: 1540, y: 330 },
        { f: 362, s: 1.5, x: 1540, y: 330 },
        { f: 402, s: 1, x: 960, y: 540 },
      ]}
    >
      {(cam, f) => (
        <>
          <Target cam={cam} from={8} to={80} x={806} y={16} w={224} h={32} color={C.shadowHi} label="REC ON · RYU OFF" />
          <Callout from={10} to={84} x={70} y={330} width={600} tone="shadow" tag="03" title="Ryu stops listening">
            Meeting mode closes the voice session. The mic belongs to the recorder, so “not listening” is literally true.
          </Callout>
          <Callout from={150} to={212} x={1290} y={380} width={560} title="Live draft">
            A transcript while you talk, from 30-second audio chunks.
          </Callout>
          <Target cam={cam} from={250} to={362} x={1235} y={138} w={650} h={196} />
          <Callout from={246} to={362} x={70} y={150} width={600} title="Live ledger">
            Decisions, actions and open questions surface as they’re said. They stay provisional until the final pass.
          </Callout>
          <Chapter n="03" name="CAPTURE" from={0} to={450} />
          <DemoNote opacity={presence(f, 0, 450)} />
        </>
      )}
    </Footage>
  );
}

// ── 6 · Analyse ──────────────────────────────────────────────────────────────
function Analyse() {
  const verify = unmap(1321 + 135, SC.analyse.pts)!;
  return (
    <Footage pts={SC.analyse.pts} keys={[{ f: 0, s: 1, x: 960, y: 540 }, { f: 34, s: 1.32, x: 958, y: 560 }, { f: 270, s: 1.44, x: 958, y: 585 }]}>
      {(cam, f) => (
        <>
          <Callout from={26} to={128} x={48} y={300} width={500} tag="04" title="A pipeline you can watch">
            Each stage lights up when the server actually reports it. No decorative loaders.
          </Callout>
          <Target cam={cam} from={verify - 4} to={verify + 70} x={690} y={612} w={540} h={40} color={C.ok} />
          <Callout from={verify} to={262} x={1860} align="right" y={300} width={440} title="Skeptical by design">
            A second pass audits every item against the transcript: keep it, fix it, or drop it.
          </Callout>
          <Chapter n="04" name="ANALYSE" from={0} to={270} />
          <DemoNote opacity={presence(f, 0, 270)} />
        </>
      )}
    </Footage>
  );
}

// ── 7 · The n + 1 reveal (music hit lands on frame 0) ───────────────────────
function Reveal() {
  const f = useCurrentFrame();
  const over = presence(f, 48, 142, 14, 16);
  return (
    <Footage pts={SC.reveal.pts} dim={0.86 * over} blur={14 * over} keys={[{ f: 0, s: 1, x: 960, y: 540 }, { f: 140, s: 1, x: 960, y: 540 }, { f: 178, s: 1.42, x: 960, y: 300 }, { f: 238, s: 1.42, x: 960, y: 300 }, { f: 276, s: 1, x: 960, y: 540 }]}>
      {(cam) => (
        <>
          <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", gap: 26, opacity: presence(f, 50, 142, 10, 14) }}>
            <Kinetic text="n + 1 notes" start={52} size={150} stagger={6} highlight={{ n: C.systemHi, "1": C.gold }} />
            <Kinetic text="One for the meeting. One for every person in it." start={72} size={40} weight={400} font={F.body} spacing={0} stagger={2} color={C.text} />
          </AbsoluteFill>
          <Target cam={cam} from={176} to={240} x={680} y={129} w={558} h={151} />
          <Target cam={cam} from={188} to={242} x={799} y={315} w={656} h={130} />
          <Target cam={cam} from={196} to={244} x={463} y={315} w={320} h={130} color={C.gold} />
          <Callout from={182} to={244} x={510} y={820} width={900} title="One shared. One each.">
            The meeting note is the shared truth. Every person gets their own, and gold marks yours.
          </Callout>
          <Callout from={250} to={300} x={70} y={640} width={460} title="Then it briefs you">
            When the notes land, Ryu tells you out loud what matters.
          </Callout>
          <Chapter n="05" name="N + 1 NOTES" from={150} to={300} />
          <DemoNote opacity={presence(f, 150, 300)} />
        </>
      )}
    </Footage>
  );
}

// ── 8 · Your note ────────────────────────────────────────────────────────────
function Yours() {
  const click = unmap(1871, SC.yours.pts)!;
  return (
    <Footage pts={SC.yours.pts} keys={[{ f: 0, s: 1, x: 960, y: 540 }, { f: 36, s: 1, x: 960, y: 540 }, { f: 70, s: 1.36, x: 960, y: 360 }, { f: 138, s: 1.36, x: 960, y: 360 }, { f: 168, s: 1.36, x: 960, y: 560 }, { f: 222, s: 1.36, x: 960, y: 560 }, { f: 256, s: 1, x: 960, y: 540 }]}>
      {(cam, f) => (
        <>
          <Cursor x={518} y={365} clickAt={click} from={Math.max(0, click - 20)} to={click + 14} />
          <Target cam={cam} from={72} to={140} x={600} y={397} w={730} h={120} color={C.gold} />
          <Callout from={72} to={142} x={1500} y={300} width={380} tone="gold" title="Your to-dos">
            Computed from the ledger in code. Each one cites the transcript line it came from.
          </Callout>
          <Target cam={cam} from={172} to={224} x={600} y={539} w={730} h={70} color={C.gold} />
          <Callout from={170} to={226} x={1500} y={330} width={380} tone="gold" title="Owed to you">
            What other people promised you. Most tools forget this part.
          </Callout>
          <Chapter n="05" name="N + 1 NOTES" from={0} to={270} />
          <DemoNote opacity={presence(f, 0, 270)} />
        </>
      )}
    </Footage>
  );
}

// ── 9 · Priya's note ─────────────────────────────────────────────────────────
function Priya() {
  const click = unmap(2117, SC.priya.pts)!;
  return (
    <Footage pts={SC.priya.pts} keys={[{ f: 0, s: 1, x: 960, y: 540 }, { f: 30, s: 1, x: 960, y: 540 }, { f: 70, s: 1.22, x: 960, y: 430 }, { f: 120, s: 1.26, x: 960, y: 430 }]}>
      {(_cam, f) => (
        <>
          <Cursor x={861} y={365} clickAt={click} from={Math.max(0, click - 16)} to={click + 14} />
          <Callout from={40} to={120} x={1850} align="right" y={220} width={430} title="Everyone else's">
            Priya’s note reads as a ready-to-send follow-up: her to-dos, and what she’s owed.
          </Callout>
          <Chapter n="05" name="N + 1 NOTES" from={0} to={120} />
          <DemoNote opacity={presence(f, 0, 120)} />
        </>
      )}
    </Footage>
  );
}

// ── 10 · Trust ───────────────────────────────────────────────────────────────
const PRINCIPLES: { head: string; sub: string; tag: string; hl: Record<string, string> }[] = [
  { tag: "EVIDENCE", head: "Evidence or it doesn’t exist.", sub: "Items citing lines that aren’t in the transcript are dropped in code, not by prompt.", hl: { evidence: C.systemHi } },
  { tag: "ON-DEVICE", head: "Your notes live on your device.", sub: "The server processes each meeting, then forgets it. It stores nothing.", hl: { device: C.gold } },
  { tag: "BYOK", head: "Your keys. Free tiers.", sub: "A free Google key plus a local LiveKit server. Groq and AssemblyAI are optional upgrades.", hl: { keys: C.systemHi } },
];
function Trust() {
  const f = useCurrentFrame();
  return (
    <AbsoluteFill>
      <Backdrop frame={1760} blur={30} brightness={0.28} drift={0.0004} />
      {PRINCIPLES.map((p, i) => {
        const s = i * 90;
        const vis = presence(f, s, s + 90, 1, 12);
        if (vis <= 0) return null;
        return (
          <AbsoluteFill key={p.tag} style={{ alignItems: "center", justifyContent: "center", gap: 30, padding: 140, opacity: vis }}>
            <div style={{ fontFamily: F.mono, fontSize: 20, letterSpacing: 4, color: C.system, border: `1px solid ${C.system}`, padding: "5px 14px", opacity: presence(f, s + 2, s + 90, 10, 12) }}>
              {String(i + 1).padStart(2, "0")} · {p.tag}
            </div>
            <Kinetic text={p.head} start={s + 6} size={92} stagger={4} highlight={p.hl} />
            <div style={{ fontFamily: F.body, fontSize: 34, color: C.text, maxWidth: 1180, textAlign: "center", lineHeight: 1.4, opacity: easeOut((f - s - 26) / 16) }}>{p.sub}</div>
          </AbsoluteFill>
        );
      })}
      <Chapter n="06" name="TRUST" from={0} to={270} />
    </AbsoluteFill>
  );
}

// ── 11 · Outro ───────────────────────────────────────────────────────────────
function Outro() {
  const f = useCurrentFrame();
  const out = 1 - Math.min(1, Math.max(0, (f - 128) / 22));
  return (
    <AbsoluteFill style={{ opacity: out }}>
      <Backdrop frame={150} blur={16} brightness={0.5} drift={0.0008} />
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", gap: 26 }}>
        <div style={{ fontFamily: F.display, fontWeight: 700, fontSize: 180, letterSpacing: 52, marginRight: -52, color: C.ice, textShadow: `0 0 40px ${C.systemGlow}, 0 0 100px ${C.systemGlow}` }}>
          <Decode text="RYU" start={6} dur={22} seed="outro" />
        </div>
        <div style={{ opacity: easeOut((f - 26) / 18) }}>
          <Kinetic text="Speak. Meet. Get n + 1 notes." start={26} size={46} weight={500} stagger={3} highlight={{ n: C.systemHi, "1": C.gold }} />
        </div>
        <div style={{ marginTop: 18, fontFamily: F.mono, fontSize: 20, letterSpacing: 5, color: C.muted, opacity: easeOut((f - 50) / 18) }}>EXPO · LIVEKIT · GEMINI LIVE</div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
}

// ── Sound ────────────────────────────────────────────────────────────────────
type Sfx = "open" | "rec" | "stop" | "done" | "notice" | "whoosh" | "blip";
function appSfx(): { at: number; kind: Sfx }[] {
  const groups = new Map<number, { freq: number; type: string }[]>();
  for (const s of captureMain.sfx) groups.set(s.frame, [...(groups.get(s.frame) ?? []), s]);
  const kindOf = (g: { freq: number; type: string }[]): Sfx =>
    g[0].freq === 440 ? "rec" : g[0].type === "triangle" && g[0].freq === 660 ? "stop" : g[0].freq === 784 ? "done" : g[0].freq === 988 ? "notice" : "open";
  const out: { at: number; kind: Sfx }[] = [];
  for (const [src, g] of groups) {
    for (const sc of Object.values(SC)) {
      const l = unmap(src, sc.pts);
      if (l !== null && l <= sc.len) {
        out.push({ at: Math.round(sc.at + l), kind: kindOf(g) });
        break;
      }
    }
  }
  // Clicks the capture couldn't hear (Priya's card opens with the same chime).
  out.push({ at: SC.priya.at + Math.round(unmap(2120, SC.priya.pts) ?? 22), kind: "open" });
  return out;
}
const EDIT_SFX: { at: number; kind: Sfx }[] = [
  ...[140, 262, 2032, 2302].map((at) => ({ at, kind: "whoosh" as Sfx })),
  ...[290, 409, 517, 640, 780, 876, 1106, 1215, 1596, 1722, 1820, 1960, 2046, 2136, 2226].map((at) => ({ at, kind: "blip" as Sfx })),
];
const VOL: Record<Sfx, number> = { open: 0.55, rec: 0.8, stop: 0.8, done: 0.75, notice: 0.6, whoosh: 0.45, blip: 0.22 };

export function RyuFeature() {
  const sfx = [...appSfx(), ...EDIT_SFX];
  return (
    <AbsoluteFill style={{ backgroundColor: C.abyss }}>
      {scene(0, 150, <Title />, "01 Title")}
      {scene(150, 120, <Hook />, "02 Hook")}
      {scene(SC.boot.at, SC.boot.len, <Boot />, "03 Boot")}
      {scene(SC.voice.at, SC.voice.len, <Speak />, "04 Speak")}
      {scene(SC.meeting.at, SC.meeting.len, <Capture />, "05 Capture")}
      {scene(SC.analyse.at, SC.analyse.len, <Analyse />, "06 Analyse")}
      {scene(SC.reveal.at, SC.reveal.len, <Reveal />, "07 Reveal")}
      {scene(SC.yours.at, SC.yours.len, <Yours />, "08 Yours")}
      {scene(SC.priya.at, SC.priya.len, <Priya />, "09 Priya")}
      {scene(2040, 270, <Trust />, "10 Trust")}
      {scene(2310, 150, <Outro />, "11 Outro")}
      <Finish />
      <Html5Audio src={staticFile("audio/music.wav")} volume={0.9} />
      {sfx.map((s, i) => (
        <Sequence key={`sfx${i}`} from={s.at} durationInFrames={60} name={`sfx ${s.kind}`}>
          <Html5Audio src={staticFile(`audio/sfx-${s.kind}.wav`)} volume={VOL[s.kind]} />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
}
