# Label fonts

Drop a TrueType file here to control exactly how the character label (`A`,
`B`, `C`, ...) is drawn into the exported images:

| Filename              | Used for             |
| --------------------- | -------------------- |
| `Inter-Bold.ttf`      | bold label (default) |
| `DejaVuSans-Bold.ttf` | bold label fallback  |
| `Inter-Regular.ttf`   | non-bold label       |
| `DejaVuSans.ttf`      | non-bold fallback    |

If this folder is empty the server falls back to a system font
(`fonts-dejavu-core` is installed on Railway by `nixpacks.toml`, Arial on
Windows) and finally to Pillow's built-in scalable face. `GET /api/capabilities`
reports which one is in use as `labelFont`.
