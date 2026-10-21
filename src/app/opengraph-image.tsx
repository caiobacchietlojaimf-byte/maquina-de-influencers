import { ImageResponse } from "next/og";

export const alt = "Máquina de Influencers — crie seu influencer de IA e coloque ele nos vídeos que estão viralizando";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const LOGO = "M130 955L130 695Q130 688 135 683L482 343Q518 312 560 340Q575 355 575 382L575 570Q577 590 598 593Q612 593 620 584L868 343Q905 312 947 340Q962 355 962 382L962 570Q964 590 985 593Q998 593 1006 585L1050 543Q1082 518 1112 545Q1125 557 1125 575L1125 872Q1125 880 1119 886L1002 1000Q970 1025 935 1003Q915 988 915 960L915 772Q912 748 890 745Q876 745 866 754L612 1000Q580 1025 545 1003Q527 988 527 960L527 772Q524 748 502 745Q488 745 478 754L225 1000Q193 1025 158 1003Q130 985 130 955Z";

async function displayFont(): Promise<ArrayBuffer | null> {
  try {
    const css = await (await fetch("https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:wght@800")).text();
    const url = css.match(/src: url\((.+?)\) format\('(?:opentype|truetype)'\)/)?.[1];
    return url ? await (await fetch(url)).arrayBuffer() : null;
  } catch {
    return null;
  }
}

export default async function OpengraphImage() {
  const font = await displayFont();
  return new ImageResponse(
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 72, background: "#fafaf7", color: "#0f0f12", fontFamily: font ? "Bricolage" : "sans-serif" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
        <svg width="64" height="64" viewBox="118 160 1020 1020"><path d={LOGO} fill="#0f0f12" /></svg>
        <span style={{ fontSize: 34, fontWeight: 800, letterSpacing: -1 }}>Máquina de Influencers</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        <span style={{ display: "flex", alignSelf: "flex-start", padding: "8px 16px", borderRadius: 10, background: "#dbf902", fontSize: 26, fontWeight: 800, transform: "rotate(-2deg)" }}>Estúdio de influencers com IA</span>
        <span style={{ fontSize: 88, fontWeight: 800, letterSpacing: -4, lineHeight: 1 }}>Crie o influencer.</span>
        <span style={{ fontSize: 88, fontWeight: 800, letterSpacing: -4, lineHeight: 1, color: "#e0136f" }}>A IA faz o resto.</span>
      </div>
      <span style={{ fontSize: 28, color: "#55555d" }}>Escolha um viral, coloque você ou o seu influencer e publique no TikTok e no Instagram.</span>
    </div>,
    { ...size, fonts: font ? [{ name: "Bricolage", data: font, weight: 800, style: "normal" }] : undefined },
  );
}
