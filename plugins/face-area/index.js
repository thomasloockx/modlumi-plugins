// Totals the area of the selected faces, including faces inside selected groups and components.
// A port of Eneroth Face Area Counter (MIT) by Julia Christina Eneroth:
// https://github.com/Eneroth3/eneroth-face-area-counter
//
// Copyright (c) 2017 Julia Christina Eneroth
//
// Permission is hereby granted, free of charge, to any person obtaining a copy of this software
// and associated documentation files (the "Software"), to deal in the Software without
// restriction, including without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the
// Software is furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in all copies or
// substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING
// BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
// NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

// Adds the area of every face in elements, descending into containers. Areas are measured in
// each face's own context, so scaled instances report their definition's area.
/**
 * @param {Iterable<modlumi.DrawingElement>} elements
 * @param {{ area: number, faces: number }} totals
 */
function countFaces(elements, totals) {
  for (const element of elements) {
    if (element instanceof modlumi.Face) {
      totals.area += element.area;
      totals.faces += 1;
    } else if (element instanceof modlumi.Group) {
      countFaces(element.entities, totals);
    } else if (element instanceof modlumi.ComponentInstance) {
      countFaces(element.definition.entities, totals);
    }
  }
  return totals;
}

/** @param {modlumi.PluginContext} context */
export function activate(context) {
  context.registerCommand({
    id: "total-area",
    title: "Total Face Area",
    tip: "Shows the total area of the selected faces, including those inside groups and components.",
    when: "selection",
    contextMenu: true,
    run() {
      const model = modlumi.activeModel;
      const { area, faces } = countFaces(model.selection, { area: 0, faces: 0 });
      if (faces === 0) {
        context.showMessage("The selection has no faces.");
        return;
      }
      context.showMessage(`${model.formatArea(area)} in ${faces} ${faces === 1 ? "face" : "faces"}`);
    },
  });
}
