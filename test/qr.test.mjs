import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import jsQR from "jsqr";
import { GifReader } from "omggif";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const defaultUrl = "https://example.test/talk";
let directory;
let scripts;

before(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), "talk-qr-"));
  const output = path.join(directory, "talk.html");
  execFileSync(process.execPath, ["scripts/render-code.mjs", "--input", "examples/talk.md", "--output", output], { cwd: root });
  scripts = [...fs.readFileSync(output, "utf8").matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)]
    .map(match => match[1]);
});
after(() => fs.rmSync(directory, { recursive: true, force: true }));

function openPage() {
  const stored = new Map();
  const elements = new Map();
  let nextUrl;
  for (const id of ["qr-hover-zone", "qr-floating", "qr-image", "qr-resize-handle", "qr-error"]) {
    elements.set(id, {
      listeners: {},
      style: { setProperty(name, value) { this[name] = value; } },
      classList: { add() {}, remove() {} },
      addEventListener(name, callback) { this.listeners[name] = callback; },
      getBoundingClientRect: () => ({ right: 400 }),
      setPointerCapture() {}, releasePointerCapture() {},
      removeAttribute(name) { if (name === "src") this.source = ""; else delete this[name]; },
    });
  }
  const image = elements.get("qr-image");
  Object.defineProperty(image, "src", {
    configurable: true,
    get() { return this.source; },
    set(value) {
      assert.match(value, /^data:image\/gif;base64,/, "QR resources must be embedded");
      this.source = value;
    },
  });
  const context = vm.createContext({
    window: { location: { href: defaultUrl }, prompt: () => nextUrl },
    document: { getElementById: id => elements.get(id) },
    localStorage: { getItem: key => stored.get(key), setItem: (key, value) => stored.set(key, value) },
    fetch() { assert.fail("The exported QR must not fetch resources"); },
  });
  for (const script of scripts) vm.runInContext(script, context);
  return {
    image, stored, elements,
    edit(value) {
      nextUrl = value;
      elements.get("qr-floating").listeners.click({ target: image });
    },
  };
}

function decodedImage(image) {
  const data = Buffer.from(image.src.split(",")[1], "base64");
  const gif = new GifReader(data);
  const pixels = new Uint8ClampedArray(gif.width * gif.height * 4);
  gif.decodeAndBlitFrameRGBA(0, pixels);
  const decoded = jsQR(pixels, gif.width, gif.height, { inversionAttempts: "dontInvert" });
  assert.ok(decoded, "Generated image must decode as a QR code");
  return decoded.data;
}

test("exported page encodes its default URL without a network resource", () => {
  assert.equal(decodedImage(openPage().image), defaultUrl);
});

for (const [name, url] of [
  ["Unicode", "https://example.test/Grüße/東京?emoji=🦊"],
  ["long URL", "https://example.test/talk?notes=" + "abcdefghij".repeat(70)],
  ["HTML characters", "https://example.test/?q=</script><img src=x onerror='alert(1)'>&quote=\""],
]) {
  test(`editing the URL encodes ${name} literally and saves it`, () => {
    const page = openPage();
    const previous = page.image.src;
    page.edit(url);
    assert.notEqual(page.image.src, previous);
    assert.equal(decodedImage(page.image), url);
    assert.equal(page.stored.get("talkMarkdownQr.url"), url);
  });
}

test("resizing preserves the URL and persists the display size offline", () => {
  const page = openPage();
  const handle = page.elements.get("qr-resize-handle");
  handle.listeners.pointerdown({ preventDefault() {}, stopPropagation() {}, pointerId: 1 });
  handle.listeners.pointermove({ clientX: 140 });
  handle.listeners.pointerup({ pointerId: 1 });
  assert.equal(page.elements.get("qr-floating").style["--qr-size"], "260px");
  assert.equal(page.stored.get("talkMarkdownQr.size"), "260");
  assert.equal(decodedImage(page.image), defaultUrl);
});

test("an over-capacity URL hides the old QR and recovers after editing", () => {
  const page = openPage();
  page.edit("https://example.test/?q=" + "x".repeat(4000));
  assert.equal(page.image.src, "");
  assert.equal(page.image.hidden, true);
  assert.match(page.elements.get("qr-error").textContent, /use a shorter URL/);
  page.edit(defaultUrl);
  assert.equal(page.image.hidden, false);
  assert.equal(page.elements.get("qr-error").hidden, true);
  assert.equal(decodedImage(page.image), defaultUrl);
});
