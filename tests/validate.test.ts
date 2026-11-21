import { describe, expect, it } from "vitest";
import { LIMITS, validatePlayable } from "../src/qa/validate.ts";

const GOOD = `<!doctype html><html><head><meta name="viewport" content="width=device-width">
<script>
const m = window.mraid; m.addEventListener("ready", () => {}); m.addEventListener("viewableChange", () => {});
function cta(){ m.open("https://example.com"); }
</script></head><body></body></html>`;

const ruleOf = (html: string, bytes: number, id: string) =>
  validatePlayable(html, bytes).rules.find((rule) => rule.id === id);

describe("validatePlayable", () => {
  it("passes a compliant single file", () => {
    const verdict = validatePlayable(GOOD, GOOD.length);
    expect(verdict.passed).toBe(true);
    expect(verdict.rules.every((rule) => rule.passed)).toBe(true);
  });

  it("fails a file at or over 5 MB", () => {
    expect(validatePlayable(GOOD, LIMITS.hardBytes).passed).toBe(false);
    expect(validatePlayable(GOOD, LIMITS.hardBytes - 1).passed).toBe(true);
  });

  it("only warns between 2 MB and 5 MB", () => {
    const verdict = validatePlayable(GOOD, LIMITS.softBytes + 1);
    expect(verdict.passed).toBe(true);
    expect(ruleOf(GOOD, LIMITS.softBytes + 1, "size-soft")?.passed).toBe(false);
  });

  it("fails external scripts, stylesheets, remote images and iframes", () => {
    for (const snippet of [
      '<script src="https://cdn.example.com/three.js"></script>',
      '<link rel="stylesheet" href="style.css">',
      '<img src="https://example.com/a.png">',
      '<iframe src="x"></iframe>',
      "<style>a{background:url(https://example.com/a.png)}</style>",
    ]) {
      const html = GOOD.replace("</head>", `${snippet}</head>`);
      expect(ruleOf(html, html.length, "single-file")?.passed, snippet).toBe(false);
    }
  });

  it("fails network calls", () => {
    const html = GOOD.replace("</script>", 'fetch("/x");</script>');
    expect(validatePlayable(html, html.length).passed).toBe(false);
  });

  it("fails when MRAID is not wired", () => {
    const html = "<!doctype html><html><head><meta name=\"viewport\" content=\"x\"></head></html>";
    expect(ruleOf(html, html.length, "mraid-ready")?.passed).toBe(false);
  });

  it("accepts minified template-literal event names", () => {
    const html = GOOD.replace(/"ready"/, "`ready`").replace(/"viewableChange"/g, "`viewableChange`");
    expect(ruleOf(html, html.length, "mraid-ready")?.passed).toBe(true);
  });

  it("fails a redirect to the store", () => {
    const html = GOOD.replace("</script>", 'location.href = "https://example.com";</script>');
    expect(ruleOf(html, html.length, "store-via-mraid")?.passed).toBe(false);
  });

  it("fails a document without a viewport tag", () => {
    const html = GOOD.replace(/<meta[^>]*>/, "");
    expect(ruleOf(html, html.length, "viewport")?.passed).toBe(false);
  });

  it("fails an empty file (fail closed)", () => {
    expect(validatePlayable("", 0).passed).toBe(false);
  });

  it("gives the same verdict for the same input", () => {
    expect(JSON.stringify(validatePlayable(GOOD, GOOD.length))).toBe(
      JSON.stringify(validatePlayable(GOOD, GOOD.length)),
    );
  });
});
