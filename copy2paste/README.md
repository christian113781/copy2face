# Copy2Paste

Drag to select any area of a webpage, like Lightshot. By default it copies
the raw **text** in that area to your clipboard — and now, if that area
includes an image with text baked into it (a screenshot, banner, photo of
a sign, etc.), it reads that too via on-device OCR and appends it. Switch
modes any time to copy an **image** of the area instead.

## Install (Chrome / Edge / Brave)

1. Unzip this folder somewhere permanent (don't delete it after installing —
   Chrome loads the extension from these files).
2. Go to `chrome://extensions` (or `edge://extensions`).
3. Turn on **Developer mode** (top-right toggle).
4. Click **Load unpacked** and select the `copy2paste` folder.
5. Pin the extension (puzzle-piece icon in the toolbar → pin Copy2Paste).
6. **Important:** switch to a regular website tab (not `chrome://extensions`
   itself) before your first try — see the note below.

## Use it

- Click the Copy2Paste toolbar icon to open its menu, then choose
  **Start selection (text)** or **Start selection (image)** — **or** just
  press the matching keyboard shortcut, which skips the menu and starts
  selecting immediately:
  - **Alt+0** → text mode (default)
  - **Alt+Shift+0** → image mode
- Your cursor becomes a crosshair — click and drag a box over the area
  you want.
- Release the mouse — it's copied. Paste it anywhere (Ctrl+V / Cmd+V) —
  as plain text in text mode, or as an image in image mode.
- Press **Esc** any time before releasing to cancel.

The toolbar menu also has **Pick a Color (Page)** (a live-preview magnifier
that samples any pixel on the current page and copies its hex code),
**Webpage Color Analyzer** (scans the page and lists every color in use as
clickable, copyable swatches), **Settings** (jumps to the options page,
which lists all three shortcuts), and **Help** (opens a quick usage guide
in a new tab).

## Pick a Color (Page)

Choose it from the popup, or press **Alt+Shift+C**, and a small circle
appears that follows your mouse, showing a live preview of whatever pixel
it's currently over. Move it around, then click your target — that
pixel's color is copied to your clipboard as a hex code, with a preview
swatch in the confirmation toast. Press **Esc** to cancel without picking.

This works by screenshotting the current tab and sampling from that image
directly (the same technique the OCR feature uses), rather than the
browser's native EyeDropper API. That trade-off is intentional: the native
API's magnifier UI is inconsistent across operating systems — on some it
shows no visible preview at all — while this version always shows the
same circle everywhere. The trade-off is scope: it can only sample pixels
within the current browser tab, not other windows or your desktop.

## Reading text inside images and video (OCR)

Text mode automatically checks whether your selection overlaps an `<img>`,
`<canvas>`, `<svg>`, `<video>`, or anything with a CSS background-image.
If it does, Copy2Paste screenshots just that area and runs it through a
locally bundled OCR engine ([Tesseract.js](https://github.com/naptha/tesseract.js)),
then appends whatever text it finds to the DOM text already copied. This
only happens when an image or video is actually present in the selection
— plain text selections stay instant, with no OCR overhead. The first
time OCR runs it takes a bit longer (loading the engine); after that it's
faster since the engine stays warm in the background. Everything runs
entirely on your device — no image or text is ever sent to a server.

For video specifically: it reads whichever single frame happens to be
showing the moment you release the drag, so pause the video first for
best results if you're targeting specific on-screen text — a frame
mid-motion can OCR poorly, same as a blurry photo. DRM-protected video
(most paid streaming content) shows up black in screenshots by design, so
there's nothing for OCR to read there.

## Webpage Color Analyzer

Inspired by ColorZilla's feature of the same name: pick it from the popup
and a panel appears listing the distinct colors actually rendered on the
page (background, text, and border colors), sorted by how often each one
appears. Click a swatch to copy its hex code; click the panel's × or press
Esc to close it.

## Changing the keyboard shortcuts

Open **Settings** from the toolbar menu (or right-click the toolbar icon →
Options, or go to `chrome://extensions`, open Copy2Paste's details, and
click "Extension options"). That page shows all three current shortcuts
and a button that jumps straight to Chrome's own shortcut editor at
`chrome://extensions/shortcuts` — find Copy2Paste there and click the
pencil icon next to any command to record a new key combination. Chrome
requires all extension shortcuts to be set from that one page; an
extension can't capture a custom key combo on its own.

## "It didn't do anything the first time I clicked it"

This is a Chrome restriction, not a bug: extensions are **not allowed** to
run on Chrome's own internal pages — `chrome://extensions`, `chrome://newtab`,
the Chrome Web Store, etc. Right after loading the extension, that internal
page is often still the active tab, so the very first click silently does
nothing.

Clicking (or pressing a shortcut) on one of these pages now shows a red
**!** badge on the toolbar icon for a few seconds explaining why. If you
see that badge: switch to any normal website tab (e.g. a news site) and
try again — it will work there.

## How text mode works

It scans the page for text elements that visually overlap your selection
box by at least ~30% of their area, then stitches the matching pieces back
together in reading order, starting a new line whenever the surrounding
block (paragraph, list item, table cell, etc.) changes.

## Notes / limitations

- **Text mode:** since DOM matching is by element rather than exact
  character offset, dragging over just the first half of a paragraph will
  still grab that whole paragraph's text. For precise partial-line
  selection, native text selection (double click / click-drag on the text
  itself) is still more exact.
- **OCR:** quality depends on the image — clear, reasonably sized text
  reads well; small, blurry, or stylized text may come out imperfect or
  blank, same as any OCR tool. It only triggers when the selection
  actually overlaps image-like content, to keep ordinary text copies fast.
- **Image mode:** copies exactly what's visible on screen, pixel for pixel,
  including canvas content.
- If clipboard copy fails for either mode, open the page's console (F12)
  for the error — most commonly caused by the tab not currently being
  focused.
