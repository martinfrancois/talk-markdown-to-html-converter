import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const script = path.join(repoRoot, "scripts", "render-code.mjs");
const exampleInput = path.join(repoRoot, "examples", "talk.md");

let workDir;
let outputCount = 0;

before(async () => {
  workDir = await fs.mkdtemp(path.join(os.tmpdir(), "talk-render-"));
});

after(async () => {
  await fs.rm(workDir, { recursive: true, force: true });
});

const writeInput = async (name, markdown) => {
  const input = path.join(workDir, name);
  await fs.writeFile(input, markdown, "utf8");
  return input;
};

const render = async (args) => {
  outputCount += 1;
  const output = path.join(workDir, `out-${outputCount}.html`);
  const result = await execFileAsync(process.execPath, [script, ...args, "--output", output], {
    cwd: repoRoot,
  });
  return { ...result, html: await fs.readFile(output, "utf8") };
};

const urlsIn = (text) => new Set(text.match(/https?:\/\/[^\s"'<>)`]+/g) ?? []);

test("renders the example talk with GitHub-style headings and highlighted code", async () => {
  const { html } = await render(["--input", exampleInput]);

  assert.match(
    html,
    /<h1 tabindex="-1" dir="auto" class="heading-element">Retry budgets in a payment service<\/h1>/,
  );
  assert.equal(
    (html.match(/<div class="highlight notranslate position-relative overflow-auto"/g) ?? []).length,
    3,
    "one highlight block per fenced code block in examples/talk.md",
  );
  assert.match(html, /<span style="color:#[0-9A-Fa-f]{6}">/, "Shiki emits inline color spans");
  assert.doesNotMatch(html, /<pre><code class="language-/, "no code block is left unhighlighted");
  assert.match(html, /<style id="markdown-styles">/);
  assert.match(html, /<style id="render-overrides">/);
  assert.doesNotMatch(html, /Deque<Instant>/, "angle brackets inside code are HTML-escaped");
});

test("exports the bundled stylesheet with its complete license notice", async () => {
  const { html } = await render(["--input", exampleInput]);
  const license = await fs.readFile(path.join(repoRoot, "styles", "github-markdown.LICENSE"), "utf8");
  const css = await fs.readFile(path.join(repoRoot, "styles", "github-markdown.css"), "utf8");

  assert.ok(html.includes(`/*\n${license}*/\n${css}`));
});

test("custom stylesheets do not acquire the bundled stylesheet's notice", async () => {
  const css = ".markdown-body { color: rebeccapurple; }";
  const cssPath = await writeInput("custom.css", css);
  const { html } = await render(["--input", exampleInput, "--markdown-css", cssPath]);

  assert.ok(html.includes(`<style id="markdown-styles">${css}</style>`));
  assert.doesNotMatch(html, /Copyright \(c\) Sindre Sorhus/);
});

test("the page and QR resources are self-contained", async () => {
  const { html } = await render(["--input", exampleInput]);
  const markdown = await fs.readFile(exampleInput, "utf8");

  assert.doesNotMatch(html, /<link\b/, "no external stylesheet");
  assert.doesNotMatch(html, /<script[^>]*\bsrc=/, "no external script");

  // License and source URLs in comments identify authors; they do not load resources.
  const resourceHtml = html.replace(/(<style\b[^>]*>)([\s\S]*?)(<\/style>)/g,
    (_, open, css, close) => open + css.replace(/\/\*[\s\S]*?\*\//g, "") + close)
    .replace(/(<script\b[^>]*>)([\s\S]*?)(<\/script>)/g,
      (_, open, script, close) => open + script.replace(/\/\*[\s\S]*?\*\/|^\s*\/\/.*$/gm, "") + close);
  const externalHosts = [...urlsIn(resourceHtml)]
    // The SVG namespace identifies inline icons; it does not fetch a resource.
    .filter((url) => url !== "http://www.w3.org/2000/svg")
    .filter((url) => !urlsIn(markdown).has(url))
    .map((url) => new URL(url).host);
  assert.deepEqual(externalHosts, []);
});

test("raw HTML in the Markdown reaches the page, apart from filtered tags", async () => {
  const input = await writeInput("raw.md", "Hello <b>bold</b>\n\n<script>alert(1)</script>\n");

  const { html } = await render(["--input", input]);

  assert.match(html, /<b>bold<\/b>/);
  assert.match(html, /&lt;script>alert\(1\)&lt;\/script>/);
});

test("strict mode rejects a code block without a language", async () => {
  const input = await writeInput("nolang.md", "```\nno language here\n```\n");

  await assert.rejects(render(["--input", input]), /missing a language/);

  const { html } = await render(["--input", input, "--lenient"]);
  assert.match(html, /<span>no language here<\/span>/, "lenient mode renders the block as plain text");
});

test("exports the QR generator with its complete license notice", async () => {
  const { html } = await render(["--input", exampleInput]);
  const license = await fs.readFile(path.join(repoRoot, "licenses", "qrcode-generator.LICENSE"), "utf8");
  assert.ok(html.includes(`<script id="qr-generator">/*\n${license}*/`));
  assert.doesNotMatch(html, /<!-- qr-generator -->/);
});
