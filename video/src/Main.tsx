import React from "react";
import { AbsoluteFill, Audio, interpolate, Sequence, staticFile, useCurrentFrame } from "remotion";
import durations from "./durations.json";
import scenes from "./scenes.json";
import { Bg, C, FPS, sec } from "./theme";
import { BrowserFrame, Callout, Captions, SceneTitle } from "./components";
import { Architecture, AttackChat, Hook, Outro, Problem } from "./scenes/motion";

export const TEAM = ["Muhammad Yousuf", "Ahsan Ahmed Siddiqui", "Huzaifa Soomar", "Shamoeel", "Ibraheem Qadeer", "Zain Dadabhoy"];
const SITE = "agentshelf-jade.vercel.app";

const vo = durations.vo as Record<string, number>;
const cap = durations.capture as Record<string, number>;
const marks = ((durations as { marks?: { passflow?: Record<string, number> } }).marks?.passflow) ?? null;
const hasPassflow = Boolean(marks && cap.passflow && marks.passReturned && marks.shopper);
const text = (id: string) => (scenes as Array<{ id: string; text: string }>).find((s) => s.id === id)?.text ?? "";

type Scene = {
  id: string;
  vo: string;
  voDelay: number; // seconds into the scene before the VO starts
  minSeconds: number;
  tail: number; // seconds after VO ends
  render: (frames: number) => React.ReactNode;
};

/** Plays a capture so that `seconds` of footage (from `from`) fills `frames`. */
const fit = (name: string, frames: number, from = 0, to?: number) => {
  const end = Math.min(to ?? cap[name], cap[name]);
  const rate = Math.max(0.5, (end - from) / (frames / FPS));
  return { trimBefore: sec(from), playbackRate: Number(rate.toFixed(3)) };
};

const SCENES: Scene[] = [
  { id: "hook", vo: "s1-hook", voDelay: 0.3, minSeconds: 8, tail: 0.8, render: () => <Hook /> },
  { id: "problem", vo: "s2-problem", voDelay: 0.2, minSeconds: 11, tail: 1.4, render: () => <Problem /> },
  {
    id: "capture", vo: "s3-capture", voDelay: 0.4, minSeconds: 22, tail: 1.2,
    render: (frames) => {
      const a = Math.round(frames * 0.74);
      return (
        <>
          <Sequence durationInFrames={a}>
            <BrowserFrame src="capture/capture.webm" url={`${SITE}/merchant/capture`} {...fit("capture", a)}>
              <Callout at={sec(3.2)} until={sec(7.5)} x={980} y={110}>Gemini drafts the listing</Callout>
              <Callout at={sec(8)} until={sec(13)} x={980} y={110} tone="green">✓ Policy check: allowed</Callout>
              <Callout at={a - sec(3.2)} x={980} y={110} tone="paypal">Published · synced to PayPal Catalog</Callout>
            </BrowserFrame>
          </Sequence>
          <Sequence from={a} durationInFrames={frames - a}>
            <BrowserFrame src="capture/storefront.webm" url={`${SITE}/s/maya-clay`} trimBefore={sec(2.6)} playbackRate={1.2}>
              <Callout at={sec(0.5)} until={sec(4)} x={640} y={312}>← Open to any AI agent over MCP</Callout>
            </BrowserFrame>
          </Sequence>
          <SceneTitle kicker="Merchant" title="Photo → listing → live" />
        </>
      );
    },
  },
  {
    id: "pass", vo: "s4-pass", voDelay: 0.3, minSeconds: 11, tail: 1,
    render: (frames) => {
      if (hasPassflow && marks) {
        const a = Math.round(frames * 0.55);
        return (
          <>
            <Sequence durationInFrames={a}>
              <BrowserFrame src="capture/passflow.webm" url={`${SITE}/pass`} {...fit("passflow", a, marks.passForm ?? 0, (marks.continue ?? 8) + 1)}>
                <Callout at={sec(2)} x={120} y={680}>Budget · per-order limit · categories</Callout>
              </BrowserFrame>
            </Sequence>
            <Sequence from={a} durationInFrames={frames - a}>
              <BrowserFrame src="capture/passflow.webm" url={`${SITE}/pass`} {...fit("passflow", frames - a, marks.passReturned, marks.shopper)}>
                <Callout at={sec(0.6)} x={120} y={90} tone="paypal">✓ Approved once in PayPal Vault</Callout>
              </BrowserFrame>
            </Sequence>
            <SceneTitle kicker="Buyer" title="The Agent Pass" />
          </>
        );
      }
      return (
        <>
          <BrowserFrame src="capture/pass.webm" url={`${SITE}/pass`} {...fit("pass", frames)}>
            <Callout at={sec(2.5)} x={120} y={600} tone="paypal">One PayPal Vault approval</Callout>
            <Callout at={sec(6)} x={120} y={680}>Budget · per-order limit · categories</Callout>
          </BrowserFrame>
          <SceneTitle kicker="Buyer" title="The Agent Pass" />
        </>
      );
    },
  },
  {
    id: "shopper", vo: "s5-shopper", voDelay: 0.4, minSeconds: 26, tail: 1.6,
    render: (frames) => (
      <>
        <BrowserFrame src={hasPassflow ? "capture/passflow.webm" : "capture/shopper.webm"} url={`${SITE}/shopper`} {...(hasPassflow && marks ? fit("passflow", frames, marks.shopper + 1, marks.end) : fit("shopper", frames, 1.5))}>
          <Callout at={sec(9)} until={sec(15)} x={980} y={80} tone="dark">Bayesian tit-for-tat pricing engine</Callout>
          <Callout at={sec(15.5)} until={sec(21)} x={980} y={80} tone="green">AI writes the words · engine sets the price</Callout>
          <Callout at={frames - sec(5)} x={980} y={80} tone="paypal">Signed quote → PayPal capture</Callout>
        </BrowserFrame>
        <SceneTitle kicker="Agent" title="Search · haggle · pay" />
      </>
    ),
  },
  {
    id: "why", vo: "s5b-why", voDelay: 0.2, minSeconds: 8, tail: 0.8,
    render: (frames) => (
      <>
        <BrowserFrame src="capture/negotiation.webm" url={`${SITE}/merchant/negotiations`} {...fit("negotiation", frames, 12, 28)} />
        <SceneTitle kicker="Explainable" title="Why this price" />
      </>
    ),
  },
  {
    id: "attack", vo: "s6-attack", voDelay: 0.3, minSeconds: 15, tail: 1.2,
    render: (frames) => {
      const chat = Math.round(frames * 0.62);
      return (
        <>
          <Sequence durationInFrames={chat}><AttackChat durationInFrames={chat} /></Sequence>
          <Sequence from={chat} durationInFrames={frames - chat}>
            <BrowserFrame src="capture/security.webm" url={`${SITE}/security`} {...fit("security", frames - chat, 2, 13)}>
              <Callout at={sec(1)} x={980} y={90} tone="green">13 / 13 security checks pass on production</Callout>
            </BrowserFrame>
          </Sequence>
        </>
      );
    },
  },
  {
    id: "dashboard", vo: "s7-dashboard", voDelay: 0.3, minSeconds: 20, tail: 1.2,
    render: (frames) => {
      const a = Math.round(frames * 0.2);
      const b = Math.round(frames * 0.22);
      return (
        <>
          <Sequence durationInFrames={a}>
            <BrowserFrame src="capture/dashboard.webm" url={`${SITE}/merchant`} {...fit("dashboard", a, 5.2, 13)}>
              <Callout at={sec(0.8)} x={980} y={90}>AG Grid + AG Charts</Callout>
            </BrowserFrame>
          </Sequence>
          <Sequence from={a} durationInFrames={b}>
            <BrowserFrame src="capture/products.webm" url={`${SITE}/merchant/products`} {...fit("products", b, 3.5, 12.5)}>
              <Callout at={sec(0.6)} x={980} y={90} tone="dark">Inline edits, validated on the server</Callout>
            </BrowserFrame>
          </Sequence>
          <Sequence from={a + b} durationInFrames={frames - a - b}>
            <BrowserFrame src="capture/copilot.webm" url={`${SITE}/merchant/orders`} {...fit("copilot", frames - a - b, 2)}>
              <Callout at={sec(1)} x={140} y={90} tone="paypal">Copilot on the PayPal Agent Toolkit</Callout>
            </BrowserFrame>
          </Sequence>
          <SceneTitle kicker="Merchant" title="Dashboard & Copilot" />
        </>
      );
    },
  },
  { id: "arch", vo: "s8-arch", voDelay: 0.3, minSeconds: 10, tail: 1.2, render: () => <Architecture /> },
  { id: "outro", vo: "s9-outro", voDelay: 0.5, minSeconds: 9, tail: 2.5, render: () => <Outro team={TEAM} /> },
];

export const timeline = (() => {
  let at = 0;
  return SCENES.map((s) => {
    const frames = sec(Math.max(s.minSeconds, s.voDelay + (vo[s.vo] ?? 0) + s.tail));
    const item = { ...s, from: at, frames };
    at += frames;
    return item;
  });
})();

export const TOTAL_FRAMES = timeline.reduce((n, s) => n + s.frames, 0);

const Fade: React.FC<{ frames: number; children: React.ReactNode }> = ({ frames, children }) => {
  const f = useCurrentFrame();
  const o = interpolate(f, [0, 8, frames - 8, frames], [0, 1, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return <AbsoluteFill style={{ opacity: o }}>{children}</AbsoluteFill>;
};

export const Main: React.FC = () => (
  <AbsoluteFill style={{ background: C.bg }}>
    <Bg tint />
    {timeline.map((s) => (
      <Sequence key={s.id} from={s.from} durationInFrames={s.frames} name={s.id}>
        <Fade frames={s.frames}>{s.render(s.frames)}</Fade>
        <Sequence from={sec(s.voDelay)} name={`${s.id}-vo`}>
          <Audio src={staticFile(`vo/${s.vo}.mp3`)} />
        </Sequence>
        <Captions text={text(s.vo)} voStart={sec(s.voDelay)} voFrames={sec(vo[s.vo] ?? 0)} />
      </Sequence>
    ))}
  </AbsoluteFill>
);
