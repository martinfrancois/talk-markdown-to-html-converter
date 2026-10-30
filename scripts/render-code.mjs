import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

import { codeToHtml } from "shiki";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);
const gfm = require("cmark-gfm-js");

const DEFAULT_INPUT = "code.md";
const DEFAULT_TEMPLATE = "template.html";
const DEFAULT_OUTPUT = "code.html";
const DEFAULT_MARKDOWN_CSS = path.join("styles", "github-markdown.css");
const DEFAULT_THEME = "github-light-high-contrast";

const args = process.argv.slice(2);
const options = {
  input: DEFAULT_INPUT,
  template: DEFAULT_TEMPLATE,
  output: DEFAULT_OUTPUT,
  markdownCss: DEFAULT_MARKDOWN_CSS,
  theme: DEFAULT_THEME,
  strict: true, // strict by default
};

for (let i = 0; i < args.length; i += 1) {
  const flag = args[i];

  if (flag === "--input" && args[i + 1]) {
    options.input = args[i + 1];
    i += 1;
  } else if (flag === "--template" && args[i + 1]) {
    options.template = args[i + 1];
    i += 1;
  } else if (flag === "--output" && args[i + 1]) {
    options.output = args[i + 1];
    i += 1;
  } else if (flag === "--markdown-css" && args[i + 1]) {
    options.markdownCss = args[i + 1];
    i += 1;
  } else if (flag === "--theme" && args[i + 1]) {
    options.theme = args[i + 1];
    i += 1;
  } else if (flag === "--lenient" || flag === "--no-strict") {
    options.strict = false;
  } else if (flag === "--strict") {
    options.strict = true;
  } else if (flag === "--help") {
    console.log(
      [
        "Usage: node scripts/render-code.mjs",
        "  [--input code.md]",
        "  [--template template.html]",
        "  [--output code.html]",
        "  [--markdown-css styles/github-markdown.css]",
        `  [--theme ${DEFAULT_THEME}]`,
        "  [--strict] (default)",
        "  [--lenient | --no-strict] (allow fallback without highlighting)",
      ].join("\n"),
    );
    process.exit(0);
  }
}

const escapeHtml = (value) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

const decodeHtml = (value) =>
  value
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");

const isInsideListItem = (html, offset) => {
  const before = html.slice(0, offset);
  return before.lastIndexOf("<li") > before.lastIndexOf("</li>");
};

const normalizeLang = (lang) => {
  if (!lang) return "text";
  const l = String(lang).trim().toLowerCase();
  const map = {
    js: "javascript",
    jsx: "jsx",
    ts: "typescript",
    tsx: "tsx",
    sh: "bash",
    shell: "bash",
    zsh: "bash",
    yml: "yaml",
    md: "markdown",
  };
  return map[l] ?? l;
};

const inputPath = path.resolve(__dirname, "..", options.input);
const templatePath = path.resolve(__dirname, "..", options.template);
const outputPath = path.resolve(__dirname, "..", options.output);
const markdownCssPath = path.resolve(__dirname, "..", options.markdownCss);

const overrideCss = `
  body {
    zoom: 175% !important;
    font-size: 0 !important;
    line-height: 0 !important;
  }

  body .markdown-body {
    font-size: 16px !important;
    line-height: 1.5 !important;
  }

  section[aria-labelledby] > :not(.code-body),
  .react-code-view-header-element--wide,
  .react-code-view-header-element--narrow,
  .react-code-view-header-wrap--narrow,
  .react-code-view-header-wrap--wide,
  .fcgcTP {
    display: none !important;
  }

  .code-body {
    padding-bottom: calc(32px + 15rem) !important;
  }

  /* Shiki emits spans with inline colors, keep your GitHub-like background from markdown.css */
  .markdown-body pre code {
    background: transparent !important;
  }
`;

const markdown = await fs.readFile(inputPath, "utf8");
let template = await fs.readFile(templatePath, "utf8");
if (template.includes("<!-- qr-generator -->")) {
  const qrSource = await fs.readFile(require.resolve("qrcode-generator"), "utf8");
  const qrLicense = await fs.readFile(path.resolve(__dirname, "..", "licenses", "qrcode-generator.LICENSE"), "utf8");
  // The exported page redistributes the generator and must retain its notice.
  const inlineQr = `/*\n${qrLicense}*/\n${qrSource}`.replace(/<\/script/gi, "<\\/script");
  template = template.replace("<!-- qr-generator -->", () => `<script id="qr-generator">${inlineQr}</script>`);
}
let markdownCss = await fs.readFile(markdownCssPath, "utf8");
if (markdownCssPath === path.resolve(__dirname, "..", DEFAULT_MARKDOWN_CSS)) {
  // The exported page carries a copy of the bundled stylesheet and its notice.
  const licensePath = path.join(path.dirname(markdownCssPath), "github-markdown.LICENSE");
  const license = await fs.readFile(licensePath, "utf8");
  markdownCss = `/*\n${license}*/\n${markdownCss}`;
}

const markdownHtml = gfm.convert(markdown);

const withHeadingAttrs = markdownHtml.replace(
  /<h([1-6])>([\s\S]*?)<\/h\1>/g,
  '<div class="markdown-heading" dir="auto"><h$1 tabindex="-1" dir="auto" class="heading-element">$2</h$1></div>',
);

const codeBlockRe =
  /<pre><code(?: class="language-([^"]+)")?>([\s\S]*?)<\/code><\/pre>/g;

let rendered = "";
let lastIndex = 0;
let blockIndex = 0;

for (const match of withHeadingAttrs.matchAll(codeBlockRe)) {
  const full = match[0];
  const langRaw = match[1];
  const codeHtml = match[2];
  const offset = match.index ?? 0;

  rendered += withHeadingAttrs.slice(lastIndex, offset);

  const codeText = decodeHtml(codeHtml);
  const lang = normalizeLang(langRaw);

  let highlightedInner = null;

  try {
    if (options.strict && lang === "text") {
      throw new Error(
        `Strict mode: code block #${blockIndex + 1} is missing a language (use \`\`\`java, \`\`\`ts, etc).`,
      );
    }

    const shikiHtml = await codeToHtml(codeText, {
      lang,
      theme: options.theme,
    });

    // Shiki returns: <pre class="shiki"...><code>...</code></pre>
    highlightedInner = shikiHtml
      .replace(/^<pre[^>]*><code[^>]*>/s, "")
      .replace(/<\/code><\/pre>\s*$/s, "");

    if (options.strict) {
      const hasAnySpan = /<span\b/i.test(highlightedInner);
      if (!hasAnySpan) {
        throw new Error(
          `Strict mode: code block #${blockIndex + 1} did not produce highlighted output (lang="${langRaw ?? ""}" normalized="${lang}").`,
        );
      }
    }
  } catch (err) {
    if (options.strict) {
      const details =
        err && typeof err === "object" && "message" in err ? err.message : String(err);
      throw new Error(
        `Failed to highlight code block #${blockIndex + 1} (lang="${langRaw ?? ""}" normalized="${lang}"). ${details}`,
      );
    }

    // Lenient fallback: safe, readable, not highlighted
    highlightedInner = escapeHtml(codeText);
  }

  const needsListMargin = isInsideListItem(withHeadingAttrs, offset);
  const styleAttr = needsListMargin ? ' style="margin-top: 0.5rem;"' : "";

  rendered += [
    `<div class="highlight notranslate position-relative overflow-auto" dir="auto"${styleAttr}>`,
    `<pre>${highlightedInner}</pre>`,
    `<div class="zeroclipboard-container">&nbsp;</div>`,
    `</div>`,
  ].join("");

  lastIndex = offset + full.length;
  blockIndex += 1;
}

rendered += withHeadingAttrs.slice(lastIndex);

const overrideStyleTag = `<style id="render-overrides">${overrideCss}</style>`;
const markdownStyleTag = `<style id="markdown-styles">${markdownCss}</style>`;

const templateWithoutOverrides = template
  .replace(/<style id="render-overrides">[\s\S]*?<\/style>/g, "")
  .replace(/<style id="markdown-styles">[\s\S]*?<\/style>/g, "");

const articleRe =
  /(<article\b[^>]*class="[^"]*markdown-body[^"]*"[^>]*>)([\s\S]*?)(<\/article>)/;

if (!articleRe.test(template)) {
  throw new Error(`Could not find markdown body in template: ${templatePath}`);
}

const outputHtml = templateWithoutOverrides.replace(
  articleRe,
  (_, openTag, _oldContent, closeTag) => `${openTag}\n${rendered}\n${closeTag}`,
);

const outputWithOverrides = outputHtml.replace(
  "</head>",
  `${markdownStyleTag}${overrideStyleTag}</head>`,
);

await fs.writeFile(outputPath, outputWithOverrides, "utf8");
console.log(`Rendered ${path.relative(process.cwd(), outputPath)}`);
