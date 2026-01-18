import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

import { common, createStarryNight } from "@wooorm/starry-night";
import { toHtml } from "hast-util-to-html";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);
const gfm = require("cmark-gfm-js");

const DEFAULT_INPUT = "code.md";
const DEFAULT_TEMPLATE = "template.html";
const DEFAULT_OUTPUT = "code.html";
const DEFAULT_MARKDOWN_CSS = path.join("styles", "markdown.css");

// Keep your existing default, but we will not rely on this file anymore for token colors.
// Many people accidentally point this to core.css (which does not always include token colors).
const DEFAULT_SYNTAX_CSS = path.join(
  "node_modules",
  "@wooorm",
  "starry-night",
  "style",
  "core.css",
);

const args = process.argv.slice(2);
const options = {
  input: DEFAULT_INPUT,
  template: DEFAULT_TEMPLATE,
  output: DEFAULT_OUTPUT,
  markdownCss: DEFAULT_MARKDOWN_CSS,
  syntaxCss: DEFAULT_SYNTAX_CSS,
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
  } else if (flag === "--syntax-css" && args[i + 1]) {
    options.syntaxCss = args[i + 1];
    i += 1;
  } else if (flag === "--help") {
    console.log(
      'Usage: node scripts/render-code.mjs [--input code.md] [--template template.html] [--output code.html] [--markdown-css styles/markdown.css] [--syntax-css node_modules/@wooorm/starry-night/style/core.css]',
    );
    process.exit(0);
  }
}

const escapeHtml = (value) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

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

/**
 * GitHub's "PrettyLights" uses `pl-*` classes and CSS variables like:
 *   --color-prettylights-syntax-keyword
 * Your `markdown.css` already defines these variables.
 *
 * This CSS maps the `pl-*` token classes produced by @wooorm/starry-night
 * to those GitHub variables, so the highlighting actually becomes visible.
 */
const PRETTYLIGHTS_TOKEN_CSS = `
/* Prettylights token colors (map pl-* -> GitHub CSS variables) */
.pl-c { color: var(--color-prettylights-syntax-comment); }
.pl-c1, .pl-s .pl-c1 { color: var(--color-prettylights-syntax-constant); }
.pl-k { color: var(--color-prettylights-syntax-keyword); }
.pl-s, .pl-s1, .pl-s2, .pl-pds { color: var(--color-prettylights-syntax-string); }
.pl-sr, .pl-sr .pl-cce { color: var(--color-prettylights-syntax-string-regexp); }
.pl-e, .pl-en { color: var(--color-prettylights-syntax-entity); }
.pl-ent { color: var(--color-prettylights-syntax-entity-tag); }
.pl-v, .pl-vi, .pl-vm { color: var(--color-prettylights-syntax-variable); }

/* Optional: some common "diff-ish" and error-ish classes (harmless if unused) */
.pl-bu { color: var(--color-prettylights-syntax-brackethighlighter-unmatched); }
.pl-ii { color: var(--color-prettylights-syntax-invalid-illegal-text); background: var(--color-prettylights-syntax-invalid-illegal-bg); }
.pl-md { color: var(--color-prettylights-syntax-markup-deleted-text); background: var(--color-prettylights-syntax-markup-deleted-bg); }
.pl-mi1 { color: var(--color-prettylights-syntax-markup-inserted-text); background: var(--color-prettylights-syntax-markup-inserted-bg); }
`;

/**
 * Optional: GitHub's newer Tree-sitter highlighting often colors method calls in Java.
 * Starry Night (TextMate/PrettyLights style) frequently leaves method names unwrapped.
 *
 * This adds spans around ".methodName(" and "::methodName(" where the identifier
 * is currently plain text (not already wrapped in a span).
 */
const wrapJavaMethodNamesLikeGitHub = (highlightedHtml) => {
  // Wrap after "." token span
  let out = highlightedHtml.replace(
    /(<span class="pl-k">\.<\/span>)([A-Za-z_][$\w]*)(?=\s*\()/g,
    '$1<span class="pl-en">$2</span>',
  );

  // Wrap after "::" token span (if tokenized that way)
  out = out.replace(
    /(<span class="pl-k">::<\/span>)([A-Za-z_][$\w]*)(?=\s*\()/g,
    '$1<span class="pl-en">$2</span>',
  );

  return out;
};

const inputPath = path.resolve(__dirname, "..", options.input);
const templatePath = path.resolve(__dirname, "..", options.template);
const outputPath = path.resolve(__dirname, "..", options.output);
const markdownCssPath = path.resolve(__dirname, "..", options.markdownCss);
const syntaxCssPath = path.resolve(__dirname, "..", options.syntaxCss);

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
`;

const markdown = await fs.readFile(inputPath, "utf8");
const template = await fs.readFile(templatePath, "utf8");

const markdownCss = await fs.readFile(markdownCssPath, "utf8");

// Read the optional "syntaxCss" file if it exists, but do not depend on it for token colors.
let syntaxCss = "";
try {
  syntaxCss = await fs.readFile(syntaxCssPath, "utf8");
} catch {
  syntaxCss = "";
}

const markdownHtml = gfm.convert(markdown);

const starryNight = await createStarryNight(common);

const withHeadingAttrs = markdownHtml.replace(
  /<h([1-6])>([\s\S]*?)<\/h\1>/g,
  '<div class="markdown-heading" dir="auto"><h$1 tabindex="-1" dir="auto" class="heading-element">$2</h$1></div>',
);

const codeBlockRe =
  /<pre><code(?: class="language-([^"]+)")?>([\s\S]*?)<\/code><\/pre>/g;

const contentHtml = withHeadingAttrs.replace(
  codeBlockRe,
  (match, language, codeHtml, offset) => {
    const codeText = decodeHtml(codeHtml);
    const scope = language ? starryNight.flagToScope(language) : null;

    let highlightedInner;
    if (scope) {
      highlightedInner = toHtml(starryNight.highlight(codeText, scope));

      // If this is Java, optionally make method calls look closer to GitHub's Tree-sitter view.
      if (scope === "source.java") {
        highlightedInner = wrapJavaMethodNamesLikeGitHub(highlightedInner);
      }
    } else {
      highlightedInner = escapeHtml(codeText);
    }

    const scopeClass = scope ? `highlight-${scope.replace(/\./g, "-")}` : null;
    const className = [
      "highlight",
      scopeClass,
      "notranslate",
      "position-relative",
      "overflow-auto",
    ]
      .filter(Boolean)
      .join(" ");

    const needsListMargin = isInsideListItem(withHeadingAttrs, offset);
    const styleAttr = needsListMargin ? ' style="margin-top: 0.5rem;"' : "";

    return `<div class="${className}" dir="auto"${styleAttr}><pre>${highlightedInner}</pre><div class="zeroclipboard-container">&nbsp;</div></div>`;
  },
);

const overrideStyleTag = `<style id="render-overrides">${overrideCss}</style>`;
const markdownStyleTag = `<style id="markdown-styles">${markdownCss}</style>`;

// Include BOTH whatever you had, plus the token mapping that makes highlighting visible.
const syntaxStyleTag = `<style id="syntax-styles">${syntaxCss}\n${PRETTYLIGHTS_TOKEN_CSS}</style>`;

const templateWithoutOverrides = template
  .replace(/<style id="render-overrides">[\s\S]*?<\/style>/g, "")
  .replace(/<style id="markdown-styles">[\s\S]*?<\/style>/g, "")
  .replace(/<style id="syntax-styles">[\s\S]*?<\/style>/g, "");

const articleRe =
  /(<article\b[^>]*class="[^"]*markdown-body[^"]*"[^>]*>)([\s\S]*?)(<\/article>)/;

if (!articleRe.test(template)) {
  throw new Error(`Could not find markdown body in template: ${templatePath}`);
}

const outputHtml = templateWithoutOverrides.replace(
  articleRe,
  (_, openTag, _oldContent, closeTag) => `${openTag}\n${contentHtml}\n${closeTag}`,
);

const outputWithOverrides = outputHtml.replace(
  "</head>",
  `${markdownStyleTag}${syntaxStyleTag}${overrideStyleTag}</head>`,
);

await fs.writeFile(outputPath, outputWithOverrides, "utf8");
console.log(`Rendered ${path.relative(process.cwd(), outputPath)}`);
