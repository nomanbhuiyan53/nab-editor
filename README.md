

# 📝 Nab Editor

**Nab Editor** is a lightweight, dependency-free (except jQuery) rich-text (WYSIWYG) editor built for Laravel, PHP, and modern web apps.  
It provides **image resize**, **float alignment tools**, **table management**, **text formatting**, and **clean HTML output** — all in a minimal and extensible package.

---

## 🚀 Features

✅ Clean, minimal UI  
✅ Live character counter  
✅ Image upload + resize + float left/right/inline  
✅ Table creation and cell editing tools  
✅ Headings, font size (8–48px), font family  
✅ Undo/Redo, lists, alignment, indent/outdent  
✅ Zoom (90–150%) and real-time cleanup  
✅ Auto-sync hidden input for form submission  
✅ 100% client-side (no build tools required)

## 📦 Installation

### Option 1 — Use CDN (Recommended)

```html
<!-- Peer Dependencies -->
<script src="https://code.jquery.com/jquery-3.7.1.min.js"></script>
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css">

<!-- Nab Editor -->
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/nomanbhuiyan53/nab-editor@v1.0.0/dist/nab-editor.css">
<script src="https://cdn.jsdelivr.net/gh/nomanbhuiyan53/nab-editor@v1.0.0/dist/nab-editor.umd.js"></script>
````

Then initialize:

```html
<div id="my-editor"></div>

<script>
  const editor = new NabEditor('#my-editor', {
    name: 'body_html',                 // hidden input name
    placeholder: 'Start typing…',      // placeholder text
    zoom: 1.0,                         // default zoom (0.9 | 1 | 1.25 | 1.5)
    onChange(html, stats) {            // optional callback
      console.log('Characters:', stats.chars);
    }
  });
</script>
```

### Option 2 — NPM (optional)

If you prefer installing via npm:

```bash
npm install nab-editor
```

Then import in your project:

```js
import 'nab-editor/dist/nab-editor.css';
import NabEditor from 'nab-editor';
new NabEditor('#editor');
```

---

## 🧠 API Reference

### **Constructor**

```js
new NabEditor(selectorOrElement, options)
```

| Option        | Type                    | Default           | Description                            |
| ------------- | ----------------------- | ----------------- | -------------------------------------- |
| `name`        | `string`                | `'content'`       | Hidden input name (for forms)          |
| `placeholder` | `string`                | `'Start typing…'` | Placeholder text                       |
| `zoom`        | `number`                | `1.0`             | Font zoom level (0.9 / 1 / 1.25 / 1.5) |
| `onChange`    | `function(html, stats)` | `null`            | Callback fired on every input change   |

---

### **Methods**

| Method          | Description                  |
| --------------- | ---------------------------- |
| `getHTML()`     | Returns cleaned HTML         |
| `getText()`     | Returns visible plain text   |
| `getStats()`    | Returns `{ chars }` object   |
| `setHTML(html)` | Sets editor content          |
| `focus()`       | Focuses the editor           |
| `destroy()`     | Destroys the editor instance |

---

## 🧩 Toolbar Tools

| Group                  | Tools                                            |
| ---------------------- | ------------------------------------------------ |
| **Undo/Redo**          | ⟳ Undo / Redo                                    |
| **Text Style**         | Bold, Italic, Underline, Strike, Super/Subscript |
| **Paragraphs**         | Headings (H1–H6), Font Size, Font Family         |
| **Lists**              | Ordered / Unordered Lists, Indent, Outdent       |
| **Alignment**          | Left, Center, Right, Justify                     |
| **Insert**             | Link, Image, Table, Horizontal Line              |
| **Color & Highlight**  | Text color, Background highlight                 |
| **Utilities**          | Cleanup, Clear all, Zoom                         |
| **Keyboard Shortcuts** | `Ctrl/Cmd + B/I/U`                               |

---

## 🖼️ Image Tools

* Resize handles (8-way)
* Float Left / Right / Inline
* Add paragraph after image
* Delete image

---

## 📊 Table Tools

Floating toolbar appears when you select table cells:

* ➕ Insert Row Above / Below
* ➕ Insert Column Left / Right
* ❌ Delete Rows / Columns / Entire Table

---

## 🧹 Cleanup

* Removes extra spaces, invisible characters, double `<br>`
* Sanitizes all HTML (removes `<script>`/`style>` tags and event attributes)
* Auto-updates a hidden input field (`name` option)

---

## 📄 Form Example

```html
<form method="POST" action="/submit">
  <div id="editor"></div>
  <button type="submit">Submit</button>
</form>

<script>
  new NabEditor('#editor', { name: 'body_html' });
</script>
```

When submitted, your form includes:

```html
<input type="hidden" name="body_html" value="<p>Editor content...</p>">
```

---

## 🌐 CDN URLs

| File | URL                                                                                                                                                                        |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CSS  | [https://cdn.jsdelivr.net/gh/nomanbhuiyan53/nab-editor@v1.0.0/dist/nab-editor.css](https://cdn.jsdelivr.net/gh/nomanbhuiyan53/nab-editor@v1.0.0/dist/nab-editor.css)       |
| JS   | [https://cdn.jsdelivr.net/gh/nomanbhuiyan53/nab-editor@v1.0.0/dist/nab-editor.umd.js](https://cdn.jsdelivr.net/gh/nomanbhuiyan53/nab-editor@v1.0.0/dist/nab-editor.umd.js) |

---

## 🧰 Dependencies

* [jQuery ≥3.7.1](https://code.jquery.com)
* [Font Awesome ≥6.5](https://cdnjs.com/libraries/font-awesome)

---

## 🛠️ License

MIT © [Md. Noman Bhuiyan](https://github.com/nomanbhuiyan53)

---

## 🌟 Example Demo

CodePen demo (coming soon)

---

### 💬 Credits

Developed by **Md. Noman Bhuiyan**


