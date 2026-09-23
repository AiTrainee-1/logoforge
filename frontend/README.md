# LogoForge editor

React + Vite + TypeScript + Tailwind CSS v4 + Radix (shadcn-style components)
+ lucide-react. See the [root README](../README.md) for the architecture.

## Run

```bash
npm install
cp .env.example .env     # VITE_API_URL -> the Flask API
npm run dev              # http://localhost:5173
npm run build            # -> dist/
npm run lint
npx tsc -b               # type check
```

## Layout

```
src/
├── components/
│   ├── upload/     UploadDropzone, LogoUpload
│   ├── editor/     EditorCanvas, CanvasOverlays, CanvasNavigation, ImageRail
│   ├── settings/   ImageTransformPanel, LogoPanel, CharacterPanel, ExportPanel
│   ├── results/    ResultsDialog
│   ├── layout/     Header, Studio
│   ├── landing/    Landing
│   └── ui/         button, slider, select, switch, tabs, accordion, dialog,
│                   primitives, toast
├── hooks/
│   ├── useImages.ts              image list, per-image transforms, undo/redo
│   ├── useEditor.ts              logo/label/export settings + view zoom
│   ├── useProcessing.ts          start the batch, poll, collect results
│   ├── useKeyboardNavigation.ts  editor shortcuts
│   ├── useStudio.tsx             composes the above into one context
│   └── useTheme.ts               light / dark
├── services/api.ts               typed API client (XHR uploads for progress)
├── types/editor.ts               the data model
└── utils/
    ├── transforms.ts             port of the backend transform model
    ├── labels.ts                 A, B, C … Z, AA, AB
    ├── thumbnails.ts             grid thumbnails (display only)
    └── format.ts                 byte/dimension formatting
```

## Two things that are easy to confuse

**Editor view zoom** (`EditorView.zoom`, the `− 100% +` control) only changes
how large the canvas is drawn on screen. It never reaches the server.

**Image transform scale** (`ImageTransform.scale`, the "Image scale" slider,
the mouse wheel, pinch) changes where the photo sits inside the export frame
and *does* change the exported pixels.

## Preview vs final output

The canvas draws the browser's object URL of the original file, positioned with
`utils/transforms.ts`. The export is rendered by the server from the original
uploaded file using the same numbers. A preview or thumbnail is never used as
the source for a download — see `utils/thumbnails.ts`.
