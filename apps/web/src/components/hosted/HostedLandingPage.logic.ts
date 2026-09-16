export const HOSTED_LANDING_CHROME = "#081018";
export const HOSTED_LANDING_FOREGROUND = "#e8eef2";

export function applyHostedLandingDocumentChrome(doc: Document): () => void {
  const html = doc.documentElement;
  const body = doc.body;
  const metas = [...doc.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')];
  const previous = {
    htmlBackground: html.style.backgroundColor,
    htmlColorScheme: html.style.colorScheme,
    bodyBackground: body.style.backgroundColor,
    bodyColor: body.style.color,
    bodyColorScheme: body.style.colorScheme,
    themeColors: metas.map((meta) => meta.content),
  };

  html.classList.add("hosted-landing-active");
  html.style.colorScheme = "dark";
  html.style.backgroundColor = HOSTED_LANDING_CHROME;
  body.style.colorScheme = "dark";
  body.style.backgroundColor = HOSTED_LANDING_CHROME;
  body.style.color = HOSTED_LANDING_FOREGROUND;
  if (metas.length === 0) {
    const meta = doc.createElement("meta");
    meta.name = "theme-color";
    meta.content = HOSTED_LANDING_CHROME;
    doc.head.append(meta);
  } else {
    for (const meta of metas) {
      meta.content = HOSTED_LANDING_CHROME;
    }
  }

  return () => {
    html.classList.remove("hosted-landing-active");
    html.style.backgroundColor = previous.htmlBackground;
    html.style.colorScheme = previous.htmlColorScheme;
    body.style.backgroundColor = previous.bodyBackground;
    body.style.color = previous.bodyColor;
    body.style.colorScheme = previous.bodyColorScheme;
    metas.forEach((meta, index) => {
      meta.content = previous.themeColors[index] ?? "";
    });
  };
}
