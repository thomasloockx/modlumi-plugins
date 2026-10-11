# Modlumi plugins

The source of the plugins that come with [Modlumi](https://modlumi.com), a 3D
modeling app, and of its example plugins. They're complete, working plugins
written with Modlumi's JavaScript plugin API, so they're a good place to learn
how to build your own.

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
