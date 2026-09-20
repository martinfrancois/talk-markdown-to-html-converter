# Talk Markdown to HTML converter

Turns a Markdown file into one self-contained HTML page with GitHub-style layout, syntax-highlighted code blocks and a hover QR code, for talk notes and code walkthroughs shown on a projector.

## What it does

`scripts/render-code.mjs` reads a GitHub-flavored Markdown file, converts it with `cmark-gfm-js`, highlights every fenced code block with Shiki, and injects the result into `template.html`. The stylesheet in `styles/markdown.css` is inlined into the output, so the page is a single file you can copy anywhere.

The page uses a 175% zoom so code stays readable from the back of a room, stays in light mode whatever the system theme says, and has a QR code that appears when the cursor enters the top-right 20 by 20 pixel corner. Click the QR code to change the URL it encodes. Drag its bottom-left corner to resize it. URL and size are saved in the browser's local storage. By default the QR code points at the page's own URL.

## Requirements

- Node.js 22 or newer. `.nvmrc` selects Node 24. The tests pass on 22.22 and 24.20.
- npm

## Install

```sh
git clone https://github.com/martinfrancois/talk-markdown-to-html-converter.git
cd talk-markdown-to-html-converter
npm ci
```

## Usage

Put your notes in `code.md` at the repository root and run

```sh
npm run render
```

This writes `code.html` next to it. Open the file in a browser.

Other input and output paths work too. Paths are resolved relative to the repository root, not the current directory.

```sh
node scripts/render-code.mjs --input notes.md --output notes.html
```

All options:

```text
--input code.md
--template template.html
--output code.html
--markdown-css styles/markdown.css
--theme github-light-high-contrast
--strict          fail when a code block has no language or produced no highlighting (default)
--lenient         render such blocks as plain text instead
--no-strict       same as --lenient
```

Every fenced code block needs a language name, for example ` ```java `. In strict mode a block without one stops the render with an error that names the block, so you fix the Markdown instead of getting unhighlighted code on stage.

## Example

`examples/talk.md` is a short set of notes for a talk on retry budgets, with two Java blocks and one shell block.

```sh
node scripts/render-code.mjs --input examples/talk.md --output examples/talk.html
```

Open `examples/talk.html` in a browser. `npm test` renders the same file and checks the headings, the three highlighted blocks and the inlined styles.

## Input must be trusted

The converter does not sanitize HTML. `cmark-gfm-js` passes raw HTML in the Markdown through to the page. Only the tags GitHub's tagfilter extension covers are escaped: `script`, `style`, `iframe`, `title`, `textarea`, `xmp`, `noembed`, `noframes` and `plaintext`. Other tags, event handler attributes such as `onerror`, and `javascript:` links reach the output unchanged. Render only Markdown you wrote yourself. The test suite checks this behavior so a change in it shows up.

## What the page loads from the network

Styles and the QR script are inline. The one exception is the QR image itself: the page sets the image source to `https://api.qrserver.com/v1/create-qr-code/` with the QR URL as a query parameter, on every page load and every resize. That request sends the encoded URL to that service. Everything else is inline, so the notes themselves need no network. The test suite checks that no other external URL appears in the output.

## Limitations

- Only one Markdown file per page. There is no include mechanism.
- The 175% zoom and the light theme are fixed in `scripts/render-code.mjs` and `template.html`. Change them there.
- `--input`, `--output`, `--template` and `--markdown-css` are resolved from the repository root, so absolute paths are the safe choice when running from elsewhere.
- The QR code needs network access, see above.

## Third-party material

`styles/markdown.css` reproduces the Markdown rendering styles that github.com serves, which come from GitHub's Primer design system (MIT license). Shiki and cmark-gfm-js are MIT licensed npm dependencies.

## License

MIT, see `LICENSE`.
