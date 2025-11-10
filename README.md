## Quick Start (single include with Font Awesome)

```html
<script src="https://code.jquery.com/jquery-3.7.1.min.js"></script>
<link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css" rel="stylesheet" />
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/nab-editor@1.0.0/dist/nab-editor.fa.css">
<script src="https://cdn.jsdelivr.net/npm/nab-editor@1.0.0/dist/nab-editor.js"></script>

<div id="myEditor" class="nht-editor"></div>
<script>
  // Disable autoInit in code and call manually (if ever needed):
  const instance = NABEditor.mount($('#myEditor'), {
    name: 'description',
    placeholder: 'Write here…',
    fontSizes: [8,9,10,11,12,14,16,18,20,22,24,28,32,36,40,44,48] // 8 → 48
  });

  
</script>
```


# Step 7 — Versioning & releases

- Use **Semantic Versioning**:
  - `1.0.1` for fixes (no breaking changes),
  - `1.1.0` for features (compatible),
  - `2.0.0` for breaking changes.
- For each release:
  - Update `CHANGELOG.md`.
  - Bump `package.json` version (if using npm).
  - Rebuild `nab-editor.fa.css`.
  - Tag and push.

---

## Common pitfalls (and how we already avoided them)
- **Fonts 404**: we set `src: url("./webfonts/...")` so paths are relative to the bundled CSS in `dist/`.
- **CORS on fonts**: jsDelivr serves correct `Content-Type`; no custom headers needed.
- **Licensing**: we kept FA Free licenses and noted redistribution terms.

---

If you want, I can generate a **ready-to-push repo skeleton** (with `LICENSE`, `README.md`, `package.json`, `scripts/build-fa.sh`) so you can just paste your current `dist/nab-editor.css` & `dist/nab-editor.js` and run `npm run build:fa`.
