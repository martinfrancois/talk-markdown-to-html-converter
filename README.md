# Talk Markdown to HTML Converter

Create a self-contained single HTML page from a Markdown file, with GitHub-style formatting and syntax-highlighted code blocks. The output uses a large default font for readable talks and screen sharing, stays in light mode regardless of the system color setting, and includes a QR code that appears when you move the cursor to the top-right corner. The default workflow is intended for preparing readable talk notes, code walkthroughs, or presentation companion pages.

## Requirements

- Node.js 22 or newer
- npm or pnpm

## First-Time Setup

Clone the repository:

```sh
git clone https://github.com/martinfrancois/talk-markdown-to-html-converter.git
cd talk-markdown-to-html-converter
```

Install dependencies with your preferred package manager:

| Package manager | Command |
| --- | --- |
| npm | `npm install` |
| pnpm | `pnpm install` |

## Create the HTML Page

Add/edit `code.md`, then run:

| Package manager | Command |
| --- | --- |
| npm | `npm run render` |
| pnpm | `pnpm run render` |

This creates or updates:

```text
code.html
```

Open `code.html` in your browser.

## Markdown Input

By default, the converter reads:

```text
code.md
```

Use normal GitHub-flavored Markdown for headings, lists, paragraphs, and fenced code blocks.

Code blocks should include a language name:

````md
```java
public class Demo {
    public static void main(String[] args) {
        System.out.println("Hello");
    }
}
```
````

The default mode is strict. If a code block is missing a language, rendering fails so you can fix the Markdown instead of silently getting unhighlighted code.

Only render Markdown you trust. The converter does not sanitize HTML: raw HTML in the Markdown, including event handler attributes such as `onerror` and `javascript:` links, reaches the page unchanged. The only tags it escapes are the ones GitHub's tagfilter extension covers: `script`, `style`, `iframe`, `title`, `textarea`, `xmp`, `noembed`, `noframes` and `plaintext`.

## QR Code

The generated page includes a QR code in the top-right corner.

- Move the cursor inside the top-right `20px` by `20px` corner area to show it.
- Click the QR code to change the URL.
- Drag the invisible bottom-left corner of the QR code to resize it. The resize area is indicated by the cursor changing.
- The chosen URL and size are saved in your browser's local storage.

By default, the QR code points to the current page URL.

The QR image is the one thing the page loads from the network. It comes from `https://api.qrserver.com/v1/create-qr-code/`, which receives the encoded URL as a query parameter each time the page loads and each time you resize the QR code. Styles, scripts and the notes themselves are inlined into the page.

## Command Options

You can render different files without changing the defaults:

```sh
node scripts/render-code.mjs --input notes.md --output notes.html
```

Relative paths are resolved from the repository root, not from the current directory.

Available options:

```text
--input code.md
--template template.html
--output code.html
--markdown-css styles/github-markdown.css
--theme github-light-high-contrast
--strict
--lenient
--no-strict
```

Use lenient mode if you want rendering to continue even when syntax highlighting cannot be applied:

```sh
node scripts/render-code.mjs --lenient
```

## Example

`examples/talk.md` is a short set of notes for a talk on retry budgets. Render it with:

```sh
node scripts/render-code.mjs --input examples/talk.md --output examples/talk.html
```

Then open `examples/talk.html` in your browser. `npm test` renders the same file and checks the output.

## Output Features

- GitHub-style Markdown layout
- GitHub light high-contrast theme
- Large default font size for readable talks and screen sharing
- Light mode output regardless of the system color setting
- Syntax highlighting powered by Shiki
- Extra spacing below the content for comfortable scrolling
- Built-in hover QR code with editable URL and resizable display

## Third-Party Material

`styles/github-markdown.css` is the unmodified light stylesheet from [github-markdown-css 5.9.0](https://github.com/sindresorhus/github-markdown-css), under the MIT license in `styles/github-markdown.LICENSE`. Shiki and cmark-gfm-js are MIT licensed npm dependencies.

## License

MIT, see [`LICENSE`](LICENSE).

The seven-day package cooldown in `.npmrc` requires npm 11.10 or newer. Node 22 ships an older npm, so update npm before installing dependencies.
