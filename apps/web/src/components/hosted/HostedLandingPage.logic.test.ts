import { describe, expect, it } from "vite-plus/test";

import {
  applyHostedLandingDocumentChrome,
  HOSTED_LANDING_CHROME,
} from "./HostedLandingPage.logic";

function createChromeDocument() {
  const classNames = new Set<string>();
  const htmlStyle = { backgroundColor: "#ffffff", colorScheme: "light" };
  const bodyStyle = { backgroundColor: "#ffffff", color: "#262626", colorScheme: "" };
  const meta = { name: "theme-color", content: "#ffffff" };
  const headChildren: Array<{ name: string; content: string }> = [meta];

  return {
    documentElement: {
      style: htmlStyle,
      classList: {
        add: (value: string) => {
          classNames.add(value);
        },
        remove: (value: string) => {
          classNames.delete(value);
        },
        contains: (value: string) => classNames.has(value),
      },
    },
    body: { style: bodyStyle },
    head: {
      append: (node: { name: string; content: string }) => {
        headChildren.push(node);
      },
    },
    querySelectorAll: (selector: string) =>
      selector === 'meta[name="theme-color"]' ? [meta] : [],
    createElement: () => ({ name: "", content: "" }),
    classNames,
    meta,
    htmlStyle,
    bodyStyle,
  };
}

describe("hosted landing document chrome", () => {
  it("forces a dark navy document scheme and restores the previous chrome", () => {
    const doc = createChromeDocument();

    const restore = applyHostedLandingDocumentChrome(doc as unknown as Document);

    expect(doc.classNames.has("hosted-landing-active")).toBe(true);
    expect(doc.htmlStyle.colorScheme).toBe("dark");
    expect(doc.htmlStyle.backgroundColor).toBe(HOSTED_LANDING_CHROME);
    expect(doc.bodyStyle.backgroundColor).toBe(HOSTED_LANDING_CHROME);
    expect(doc.meta.content).toBe(HOSTED_LANDING_CHROME);

    restore();

    expect(doc.classNames.has("hosted-landing-active")).toBe(false);
    expect(doc.htmlStyle.colorScheme).toBe("light");
    expect(doc.htmlStyle.backgroundColor).toBe("#ffffff");
    expect(doc.meta.content).toBe("#ffffff");
  });
});
