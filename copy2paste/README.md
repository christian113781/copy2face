# Copy2Paste

Drag to select any area of a webpage, like Lightshot. By default it copies
the raw **text** in that area to your clipboard; switch modes any time to
copy an **image** of the area instead.

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

The toolbar menu also has **View/change shortcut** (jumps to the options
page, which lists both shortcuts) and **Help** (opens a quick usage guide
in a new tab).

## Changing the keyboard shortcuts

Right-click the toolbar icon → **Options** (or go to `chrome://extensions`,
open Copy2Paste's details, and click "Extension options"). That page shows
both current shortcuts and a button that jumps straight to Chrome's own
shortcut editor at `chrome://extensions/shortcuts` — find Copy2Paste there
and click the pencil icon next to either command to record a new key
combination. Chrome requires all extension shortcuts to be set from that
one page; an extension can't capture a custom key combo on its own.

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

- **Text mode:** since matching is by element rather than exact character
  offset, dragging over just the first half of a paragraph will still grab
  that whole paragraph's text. For precise partial-line selection, native
  text selection (double click / click-drag on the text itself) is still
  more exact. Text mode also won't find anything on a `<canvas>` (e.g. some
  PDF viewers), since there's no real text in the DOM there — use image
  mode for that instead.
- **Image mode:** copies exactly what's visible on screen, pixel for pixel,
  including canvas content.
- If clipboard copy fails for either mode, open the page's console (F12)
  for the error — most commonly caused by the tab not currently being
  focused.
