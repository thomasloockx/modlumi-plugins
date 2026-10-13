<p align="center">
  <a href="https://modlumi.com">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset=".github/modlumi-logo-on-dark.svg">
      <img src=".github/modlumi-logo-on-light.svg" alt="Modlumi" width="360">
    </picture>
  </a>
</p>

<h3 align="center">Plugins for Modlumi</h3>

<p align="center">
  The source of the plugins that come with <a href="https://modlumi.com">Modlumi</a>, a 3D modeling app,<br>
  and of its example plugins: complete, working code to learn the JavaScript plugin API from.
</p>

<p align="center">
  <a href="https://modlumi.com"><img src="https://img.shields.io/badge/Modlumi-0.12-FF9307?labelColor=121619" alt="Modlumi 0.12"></a>
  <a href="https://modlumi.com/docs/guides/writing-a-plugin/"><img src="https://img.shields.io/badge/docs-writing_a_plugin-FF9307?labelColor=121619" alt="Docs: Writing a plugin"></a>
  <a href="https://modlumi.com/docs/api/modlumi/"><img src="https://img.shields.io/badge/API-reference-FF9307?labelColor=121619" alt="API reference"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-FF9307?labelColor=121619" alt="MIT license"></a>
</p>

<table>
  <tr>
    <td width="50%"><a href="https://modlumi.com/docs/user-guide/plugins/#true-bend"><img src="https://modlumi.com/media/plugin-true-bend-d960f362.gif" alt="True Bend bends a slat with a live preview."></a><br><b>True Bend</b>: a tool with a live preview</td>
    <td width="50%"><a href="https://modlumi.com/docs/user-guide/plugins/#solid-inspector"><img src="https://modlumi.com/media/plugin-solid-inspector-60cb5b5f.gif" alt="Solid Inspector finds and fixes the problems in a cabinet."></a><br><b>Solid Inspector</b>: find and fix what isn't solid</td>
  </tr>
  <tr>
    <td width="50%"><a href="https://modlumi.com/docs/user-guide/plugins/#shapes"><img src="https://modlumi.com/media/plugin-shapes-863f080c.gif" alt="Shapes adds a helical ramp from a dialog."></a><br><b>Shapes</b>: parametric objects from a dialog</td>
    <td width="50%"><a href="https://modlumi.com/docs/user-guide/plugins/#levels"><img src="https://modlumi.com/media/plugin-levels-2f842454.gif" alt="Levels draws a building's floor levels in an elevation."></a><br><b>Levels</b>: a panel, an overlay and snapping</td>
  </tr>
</table>

This copy matches Modlumi 0.12. It's exported from the Modlumi source
with each release, so changes made here directly are overwritten; please open
an issue instead.

## Contents

| Folder | Plugin | Shows |
| --- | --- | --- |
| `plugins/face-area` | Face Area | The smallest one: a command in the right-click menu that walks into groups and components. |
| `plugins/select-similar` | Select Similar | Reading and changing the selection, comparing faces by plane, normal and material. |
| `plugins/cleanup` | Clean Up | A dialog of options remembered in settings, and many model edits in one undo step. |
| `plugins/modify-solids` | Modify Solids | Solid operations on groups and components that keep their names, paint and placement. |
| `plugins/shapes` | Shapes | Parametric objects: parameters kept with `entityData` and edited in Properties. |
| `plugins/obj`, `plugins/stl` | OBJ, STL | Importers and exporters, parsing text and binary files and building meshes with `MeshBuilder`. |
| `plugins/levels` | Levels | Document data, a panel, a viewport overlay, pickable items and a snap provider. |
| `plugins/solid-inspector` | Solid Inspector | A tool that highlights problems, steps the camera to each one and fixes them. |
| `plugins/true-bend` | True Bend | A tool with a live preview, typed values, keyboard input and options. |
| `examples/face-counter` | Face Counter | Commands with an icon, a shortcut, enabled and checked states, and data kept in the model. |
| `examples/stair-builder` | Stair Builder | A panel of parameters and an editable object rebuilt from Properties. |
| `examples/csv-report` | CSV Report | Writing a file the user picks. |
| `examples/vertex-editor` | Vertex Editor | A tool that moves one vertex at a time, snapping as it goes. |
| `examples/widget-gallery` | Widget Gallery | Every panel widget. |

What each built-in plugin does, with a short video, is on the
[Plugins](https://modlumi.com/docs/user-guide/plugins/) page. To write your own,
start with [Writing a plugin](https://modlumi.com/docs/guides/writing-a-plugin/).

## Installing an example

The plugins in `plugins/` already come with Modlumi. To install one of the
`examples/`:

1. Click **Code → Download ZIP** on this page and unzip it. The zip holds
   several plugins, so Modlumi can't install it as it is.
2. In Modlumi, choose **Extensions → Manage Extensions... → Install plugin...**
   and pick the example's `plugin.json`, such as
   `examples/face-counter/plugin.json`.

Pick a `plugin.json` only inside its own plugin's folder: Modlumi installs every
file in that folder. See
[Install a plugin from GitHub](https://modlumi.com/docs/user-guide/plugins/#install-a-plugin-from-github).

## Trying a change

The plugins in `plugins/` already come with Modlumi. To experiment with one,
copy its folder, give it a new `id` and `name` in `plugin.json`, then choose
**Extensions → Manage Extensions... → Install plugin...** in Modlumi and pick the
copy's `plugin.json`. Turn on **Reload plugins when their files change** to see
your edits without restarting.

## Type checking

`modlumi.d.ts` declares the whole API. With
[TypeScript](https://www.typescriptlang.org/download/) installed, check a folder
of plugins with:

```sh
tsc -p plugins
```

## Credits and licenses

Everything here is MIT-licensed; see `LICENSE`. Most built-in plugins are ports
of open-source SketchUp extensions, and keep their original copyright and
license notices at the top of their `index.js`:

- Clean Up: [CleanUp](https://github.com/thomthom/cleanup) by Thomas Thomassen
- Face Area: [Eneroth Face Area Counter](https://github.com/Eneroth3/eneroth-face-area-counter) by Julia Christina Eneroth
- Modify Solids: [Eneroth Solid Tools](https://github.com/Eneroth3/eneroth-solid-tools) by Julia Christina Eneroth
- Shapes: [Shapes](https://github.com/SketchUp/sketchup-shapes) by Trimble
- Solid Inspector: [Solid Inspector²](https://github.com/thomthom/solid-inspector) by Thomas Thomassen
- STL: [sketchup-stl](https://github.com/SketchUp/sketchup-stl) by Trimble and its contributors
- True Bend: [True Bend](https://github.com/thomthom/true-bend) by Thomas Thomassen
