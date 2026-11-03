const pptxgen = require("pptxgenjs");

const pres = new pptxgen();
pres.layout = "LAYOUT_16x9";
pres.author = "World Leds Go";
pres.title = "Guion 30s — World Leds Go";

const C = {
  black: "0A0A0A",
  charcoal: "1A1A1A",
  mid: "2A2A2A",
  gray: "3C3C3C",
  muted: "9A9A9A",
  soft: "C8C8C8",
  white: "FFFFFF",
  accent: "D4A574", // warm metal / wood undertone
  steel: "8B9A9F",
};

function bg(slide, color = C.black) {
  slide.addShape(pres.shapes.RECTANGLE, {
    x: 0,
    y: 0,
    w: 10,
    h: 5.625,
    fill: { color },
    line: { color },
  });
}

function timeBadge(slide, text, x, y) {
  slide.addShape(pres.shapes.ROUNDED_RECTANGLE, {
    x,
    y,
    w: 1.35,
    h: 0.32,
    fill: { color: C.gray },
    line: { color: C.gray },
    rectRadius: 0.04,
  });
  slide.addText(text, {
    x,
    y,
    w: 1.35,
    h: 0.32,
    fontSize: 11,
    fontFace: "Arial",
    color: C.white,
    align: "center",
    valign: "middle",
    margin: 0,
    isTextBox: true,
  });
}

function sectionLabel(slide, text, x, y) {
  slide.addText(text, {
    x,
    y,
    w: 4,
    h: 0.28,
    fontSize: 11,
    fontFace: "Arial",
    color: C.accent,
    charSpacing: 3,
    margin: 0,
    isTextBox: true,
  });
}

// ─── 1. Portada ───────────────────────────────────────────
{
  const s = pres.addSlide();
  bg(s);

  s.addText("WORLD LEDS GO", {
    x: 0.6,
    y: 1.5,
    w: 8.8,
    h: 0.4,
    fontSize: 14,
    fontFace: "Arial",
    color: C.accent,
    charSpacing: 6,
    margin: 0,
    isTextBox: true,
  });

  s.addText("Guion 30 s", {
    x: 0.6,
    y: 2.1,
    w: 8.8,
    h: 0.85,
    fontSize: 48,
    fontFace: "Arial",
    bold: true,
    color: C.white,
    margin: 0,
    isTextBox: true,
  });

  s.addText("Se integra · Se mide · Se adapta", {
    x: 0.6,
    y: 3.1,
    w: 8.8,
    h: 0.4,
    fontSize: 18,
    fontFace: "Arial",
    color: C.soft,
    margin: 0,
    isTextBox: true,
  });

  s.addText("Reel 9:16  ·  Locución subtitulada", {
    x: 0.6,
    y: 4.7,
    w: 8.8,
    h: 0.3,
    fontSize: 12,
    fontFace: "Arial",
    color: C.muted,
    margin: 0,
    isTextBox: true,
  });
}

// ─── 2. Idea rectora + specs ──────────────────────────────
{
  const s = pres.addSlide();
  bg(s);
  sectionLabel(s, "BRIEF", 0.6, 0.4);

  s.addText("Idea rectora", {
    x: 0.6,
    y: 0.85,
    w: 8.8,
    h: 0.4,
    fontSize: 32,
    fontFace: "Arial",
    bold: true,
    color: C.white,
    margin: 0,
    isTextBox: true,
  });

  s.addText("Se integra, se mide, se adapta.", {
    x: 0.6,
    y: 1.4,
    w: 8.8,
    h: 0.45,
    fontSize: 22,
    fontFace: "Arial",
    italic: true,
    color: C.accent,
    margin: 0,
    isTextBox: true,
  });

  const specs = [
    {
      label: "Subtítulos",
      body: "Roboto, blanco sobre #000000 o #3C3C3C. Máximo 2 líneas, centrados.",
    },
    {
      label: "Sonido",
      body: "Pulso electrónico grave, con un golpe seco por cada palabra de la lista.",
    },
    {
      label: "Voz",
      body: "Firme y pausada. Dice exactamente lo mismo que el subtítulo.",
    },
    {
      label: "Imagen",
      body: "Oscura y sobria: madera, mármol, hormigón y acero. Sin luminarias en primer plano.",
    },
  ];

  specs.forEach((sp, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const x = 0.6 + col * 4.6;
    const y = 2.2 + row * 1.45;

    s.addShape(pres.shapes.ROUNDED_RECTANGLE, {
      x,
      y,
      w: 4.3,
      h: 1.25,
      fill: { color: C.charcoal },
      line: { color: C.charcoal },
      rectRadius: 0.08,
    });

    s.addText(sp.label, {
      x: x + 0.25,
      y: y + 0.2,
      w: 3.8,
      h: 0.3,
      fontSize: 13,
      fontFace: "Arial",
      bold: true,
      color: C.accent,
      margin: 0,
      isTextBox: true,
    });

    s.addText(sp.body, {
      x: x + 0.25,
      y: y + 0.55,
      w: 3.8,
      h: 0.55,
      fontSize: 13,
      fontFace: "Arial",
      color: C.soft,
      margin: 0,
      isTextBox: true,
    });
  });
}

// ─── 3. Estructura temporal ───────────────────────────────
{
  const s = pres.addSlide();
  bg(s);
  sectionLabel(s, "ESTRUCTURA", 0.6, 0.35);

  s.addText("30 segundos, seis momentos", {
    x: 0.6,
    y: 0.75,
    w: 8.8,
    h: 0.4,
    fontSize: 28,
    fontFace: "Arial",
    bold: true,
    color: C.white,
    margin: 0,
    isTextBox: true,
  });

  const beats = [
    { t: "0–6 s", title: "Se integra", act: "Intro" },
    { t: "6–9 s", title: "Giro", act: "Intro" },
    { t: "9–17 s", title: "Procesos", act: "Nudo" },
    { t: "17–21 s", title: "Se mide", act: "Nudo" },
    { t: "21–26 s", title: "Se adapta", act: "Nudo" },
    { t: "26–30 s", title: "Cierre", act: "Desenlace" },
  ];

  beats.forEach((b, i) => {
    const x = 0.55 + i * 1.55;
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, {
      x,
      y: 1.7,
      w: 1.4,
      h: 2.8,
      fill: { color: C.charcoal },
      line: { color: C.charcoal },
      rectRadius: 0.08,
    });

    s.addText(String(i + 1).padStart(2, "0"), {
      x,
      y: 1.95,
      w: 1.4,
      h: 0.4,
      fontSize: 22,
      fontFace: "Arial",
      bold: true,
      color: C.accent,
      align: "center",
      margin: 0,
      isTextBox: true,
    });

    s.addText(b.t, {
      x: x + 0.08,
      y: 2.5,
      w: 1.24,
      h: 0.3,
      fontSize: 11,
      fontFace: "Arial",
      color: C.muted,
      align: "center",
      margin: 0,
      isTextBox: true,
    });

    s.addText(b.title, {
      x: x + 0.08,
      y: 3.0,
      w: 1.24,
      h: 0.7,
      fontSize: 14,
      fontFace: "Arial",
      bold: true,
      color: C.white,
      align: "center",
      margin: 0,
      isTextBox: true,
    });

    s.addText(b.act.toUpperCase(), {
      x: x + 0.08,
      y: 3.9,
      w: 1.24,
      h: 0.3,
      fontSize: 10,
      fontFace: "Arial",
      color: C.steel,
      align: "center",
      charSpacing: 1,
      margin: 0,
      isTextBox: true,
    });
  });
}

// Helper for scene slides
function sceneSlide({ section, num, time, title, image, line }) {
  const s = pres.addSlide();
  bg(s);
  sectionLabel(s, section, 0.6, 0.4);
  timeBadge(s, time, 8.05, 0.4);

  s.addText(`${num}.  ${title}`, {
    x: 0.6,
    y: 0.95,
    w: 7.2,
    h: 0.5,
    fontSize: 32,
    fontFace: "Arial",
    bold: true,
    color: C.white,
    margin: 0,
    isTextBox: true,
  });

  // Image brief card
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, {
    x: 0.6,
    y: 1.7,
    w: 8.8,
    h: 1.35,
    fill: { color: C.charcoal },
    line: { color: C.charcoal },
    rectRadius: 0.08,
  });

  s.addText("IMAGEN", {
    x: 0.9,
    y: 1.9,
    w: 8.2,
    h: 0.25,
    fontSize: 11,
    fontFace: "Arial",
    bold: true,
    color: C.accent,
    charSpacing: 2,
    margin: 0,
    isTextBox: true,
  });

  s.addText(image, {
    x: 0.9,
    y: 2.25,
    w: 8.2,
    h: 0.55,
    fontSize: 15,
    fontFace: "Arial",
    color: C.soft,
    margin: 0,
    isTextBox: true,
  });

  // Locution / subtitle
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, {
    x: 0.6,
    y: 3.3,
    w: 8.8,
    h: 1.7,
    fill: { color: C.mid },
    line: { color: C.mid },
    rectRadius: 0.08,
  });

  s.addText("SUBTÍTULO Y LOCUCIÓN", {
    x: 0.9,
    y: 3.55,
    w: 8.2,
    h: 0.25,
    fontSize: 11,
    fontFace: "Arial",
    bold: true,
    color: C.muted,
    charSpacing: 2,
    margin: 0,
    isTextBox: true,
  });

  s.addText(`“${line}”`, {
    x: 0.9,
    y: 3.95,
    w: 8.2,
    h: 0.8,
    fontSize: 22,
    fontFace: "Arial",
    italic: true,
    color: C.white,
    margin: 0,
    isTextBox: true,
  });
}

// ─── 4. Se integra ────────────────────────────────────────
sceneSlide({
  section: "INTRODUCCIÓN",
  num: "1",
  time: "0–6 s",
  title: "Se integra",
  image:
    "Ambiente terminado con la luz integrada a la arquitectura, sin luminaria visible (assets del Drive).",
  line: "La mejor luz se integra a la arquitectura.",
});

// ─── 5. Giro ──────────────────────────────────────────────
sceneSlide({
  section: "INTRODUCCIÓN",
  num: "2",
  time: "6–9 s",
  title: "Giro",
  image: "Corte seco a un macro de soldadura sobre el chip.",
  line: "Detrás de ella, ingeniería.",
});

// ─── 6. Los procesos ──────────────────────────────────────
{
  const s = pres.addSlide();
  bg(s);
  sectionLabel(s, "NUDO", 0.6, 0.3);
  timeBadge(s, "9–17 s", 8.05, 0.3);

  s.addText("3.  Los procesos", {
    x: 0.6,
    y: 0.75,
    w: 7.2,
    h: 0.4,
    fontSize: 28,
    fontFace: "Arial",
    bold: true,
    color: C.white,
    margin: 0,
    isTextBox: true,
  });

  s.addText(
    "Cortes de ~1 s: fresadora, cabina de pintura, soldadura, sellado, vulcanizado, fuente y Everfine. Sobre cada plano, una palabra grande al ritmo del golpe.",
    {
      x: 0.6,
      y: 1.25,
      w: 8.8,
      h: 0.55,
      fontSize: 13,
      fontFace: "Arial",
      color: C.soft,
      margin: 0,
      isTextBox: true,
    }
  );

  const words = [
    "DISEÑO",
    "CORTE",
    "ACABADO",
    "SOLDADURA",
    "SELLADO",
    "VULCANIZADO",
    "PROGRAMACIÓN",
    "MEDICIÓN",
  ];

  words.forEach((w, i) => {
    const col = i % 4;
    const row = Math.floor(i / 4);
    const x = 0.6 + col * 2.3;
    const y = 2.0 + row * 0.85;

    s.addShape(pres.shapes.ROUNDED_RECTANGLE, {
      x,
      y,
      w: 2.15,
      h: 0.7,
      fill: { color: C.charcoal },
      line: { color: C.charcoal },
      rectRadius: 0.06,
    });

    s.addText(w, {
      x,
      y,
      w: 2.15,
      h: 0.7,
      fontSize: 12,
      fontFace: "Arial",
      bold: true,
      color: C.white,
      align: "center",
      valign: "middle",
      charSpacing: 1,
      margin: 0,
      isTextBox: true,
    });
  });

  s.addText("“Cada etapa, bajo un mismo estándar.”", {
    x: 0.6,
    y: 4.0,
    w: 8.8,
    h: 0.45,
    fontSize: 18,
    fontFace: "Arial",
    italic: true,
    color: C.accent,
    margin: 0,
    isTextBox: true,
  });

  s.addText("LOCUCIÓN", {
    x: 0.6,
    y: 4.5,
    w: 8.8,
    h: 0.25,
    fontSize: 10,
    fontFace: "Arial",
    color: C.muted,
    charSpacing: 2,
    margin: 0,
    isTextBox: true,
  });
}

// ─── 7. Se mide ───────────────────────────────────────────
sceneSlide({
  section: "NUDO",
  num: "4",
  time: "17–21 s",
  title: "Se mide",
  image: "Everfine midiendo, con la pantalla de resultados.",
  line: "La luz se mide. CRI superior a 90.",
});

// ─── 8. Se adapta ─────────────────────────────────────────
sceneSlide({
  section: "NUDO",
  num: "5",
  time: "21–26 s",
  title: "Se adapta",
  image:
    "Perfil cortado a medida y fuente acercándose al dispositivo para programar por NFC.",
  line: "Perfiles a medida. Fuentes programables. Cada proyecto, su propia luz.",
});

// ─── 9. Cierre ────────────────────────────────────────────
{
  const s = pres.addSlide();
  bg(s);
  sectionLabel(s, "DESENLACE", 0.6, 0.4);
  timeBadge(s, "26–30 s", 8.05, 0.4);

  s.addText("6.  Cierre", {
    x: 0.6,
    y: 0.95,
    w: 7.2,
    h: 0.5,
    fontSize: 32,
    fontFace: "Arial",
    bold: true,
    color: C.white,
    margin: 0,
    isTextBox: true,
  });

  s.addShape(pres.shapes.ROUNDED_RECTANGLE, {
    x: 0.6,
    y: 1.7,
    w: 8.8,
    h: 1.15,
    fill: { color: C.charcoal },
    line: { color: C.charcoal },
    rectRadius: 0.08,
  });

  s.addText("IMAGEN", {
    x: 0.9,
    y: 1.9,
    w: 8.2,
    h: 0.25,
    fontSize: 11,
    fontFace: "Arial",
    bold: true,
    color: C.accent,
    charSpacing: 2,
    margin: 0,
    isTextBox: true,
  });

  s.addText(
    "Vuelve al ambiente. Silencio. Logo WLG blanco sobre negro.",
    {
      x: 0.9,
      y: 2.25,
      w: 8.2,
      h: 0.4,
      fontSize: 15,
      fontFace: "Arial",
      color: C.soft,
      margin: 0,
      isTextBox: true,
    }
  );

  s.addText("“El alma de la luz. Tecnología que ilumina y perdura.”", {
    x: 0.6,
    y: 3.2,
    w: 8.8,
    h: 0.55,
    fontSize: 20,
    fontFace: "Arial",
    italic: true,
    color: C.white,
    margin: 0,
    isTextBox: true,
  });

  s.addText("TEXTO FINAL", {
    x: 0.6,
    y: 4.0,
    w: 8.8,
    h: 0.25,
    fontSize: 11,
    fontFace: "Arial",
    color: C.muted,
    charSpacing: 2,
    margin: 0,
    isTextBox: true,
  });

  s.addText("WORLD LEDS GO", {
    x: 0.6,
    y: 4.35,
    w: 8.8,
    h: 0.45,
    fontSize: 28,
    fontFace: "Arial",
    bold: true,
    color: C.white,
    charSpacing: 4,
    margin: 0,
    isTextBox: true,
  });
}

// ─── 10. Resumen locuciones ───────────────────────────────
{
  const s = pres.addSlide();
  bg(s);
  sectionLabel(s, "RESUMEN", 0.6, 0.3);

  s.addText("Locuciones en secuencia", {
    x: 0.6,
    y: 0.7,
    w: 8.8,
    h: 0.4,
    fontSize: 26,
    fontFace: "Arial",
    bold: true,
    color: C.white,
    margin: 0,
    isTextBox: true,
  });

  const lines = [
    { t: "0–6", q: "La mejor luz se integra a la arquitectura." },
    { t: "6–9", q: "Detrás de ella, ingeniería." },
    { t: "9–17", q: "Cada etapa, bajo un mismo estándar." },
    { t: "17–21", q: "La luz se mide. CRI superior a 90." },
    { t: "21–26", q: "Perfiles a medida. Fuentes programables. Cada proyecto, su propia luz." },
    { t: "26–30", q: "El alma de la luz. Tecnología que ilumina y perdura." },
  ];

  lines.forEach((L, i) => {
    const y = 1.3 + i * 0.65;

    s.addText(L.t, {
      x: 0.6,
      y,
      w: 1.0,
      h: 0.5,
      fontSize: 12,
      fontFace: "Arial",
      bold: true,
      color: C.accent,
      valign: "middle",
      margin: 0,
      isTextBox: true,
    });

    s.addText(`“${L.q}”`, {
      x: 1.7,
      y,
      w: 7.7,
      h: 0.5,
      fontSize: 14,
      fontFace: "Arial",
      color: C.soft,
      valign: "middle",
      margin: 0,
      isTextBox: true,
    });
  });
}

pres
  .writeFile({
    fileName:
      "/Users/wohl5/Dropbox/USUARIOS/IVAN/CODIGO/depas/presentaciones/Guion-30s-World-Leds-Go.pptx",
  })
  .then(() => console.log("OK"))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
