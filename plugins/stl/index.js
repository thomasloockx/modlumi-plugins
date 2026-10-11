// STL import and export, ported from sketchup-stl.
//
// Copyright (c) 2014 Trimble Navigation Ltd.
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

/**
 * @typedef {"Millimeters" | "Centimeters" | "Meters" | "Inches" | "Feet"} Unit
 * @typedef {{
 *   importUnits: Unit, mergeFaces: boolean, preserveOrigin: boolean,
 *   exportUnits: Unit | "Model Units", format: "Binary" | "ASCII", selectionOnly: boolean,
 * }} Options
 * @typedef {[modlumi.Point3d, modlumi.Point3d, modlumi.Point3d]} Triangle
 */

const model = modlumi.activeModel;
/** Meters per unit. @type {Record<Unit, number>} */
const kMeters = { Millimeters: 0.001, Centimeters: 0.01, Meters: 1, Inches: 0.0254, Feet: 0.3048 };
/** @type {Unit[]} */
const kUnits = ["Millimeters", "Centimeters", "Meters", "Inches", "Feet"];
/** The STL unit of each model unit; yards export as feet. */
const kModelUnits = /** @type {Record<string, Unit>} */ ({
  mm: "Millimeters", cm: "Centimeters", m: "Meters", in: "Inches", ft: "Feet", yd: "Feet",
});
/** @type {Options} */
const kDefaults = {
  importUnits: "Millimeters",
  mergeFaces: false,
  preserveOrigin: true,
  exportUnits: "Model Units",
  format: "Binary",
  selectionOnly: false,
};
// A binary STL file is an 80 byte header, a facet count, and 50 bytes per facet.
const kHeaderBytes = 80;
const kFacetBytes = 50;

/**
 * Whether bytes are a binary STL file: its size matches the facet count in its header. Some
 * binary files start with "solid" too, so the word alone tells nothing.
 * @param {Uint8Array} bytes
 */
export function isBinaryStl(bytes) {
  if (bytes.length < kHeaderBytes + 4) {
    return false;
  }
  const count = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(kHeaderBytes, true);
  return bytes.length === kHeaderBytes + 4 + count * kFacetBytes;
}

/**
 * Reads the triangles of a binary STL file, scaled to meters.
 * @param {Uint8Array} bytes
 * @param {number} scale
 * @returns {number[][][]}
 */
function readBinary(bytes, scale) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const count = Math.min(view.getUint32(kHeaderBytes, true),
    Math.floor((bytes.length - kHeaderBytes - 4) / kFacetBytes));
  const triangles = [];
  for (let facet = 0; facet < count; ++facet) {
    // Each facet starts with its normal, which the corners' order already gives.
    const at = kHeaderBytes + 4 + facet * kFacetBytes + 12;
    /** @param {number} index */
    const corner = (index) => [0, 1, 2].map((axis) => view.getFloat32(at + index * 12 + axis * 4, true) * scale);
    triangles.push([corner(0), corner(1), corner(2)]);
  }
  return triangles;
}

/**
 * Reads the triangles of an ASCII STL file, scaled to meters: every three "vertex" lines.
 * @param {string} text
 * @param {number} scale
 * @returns {number[][][]}
 */
function readAscii(text, scale) {
  const triangles = [];
  let triangle = [];
  for (const line of text.split(/\r?\n/)) {
    const words = line.trim().split(/\s+/);
    if (words[0] !== "vertex" || words.length < 4) {
      continue;
    }
    triangle.push(words.slice(1, 4).map((value) => Number(value) * scale));
    if (triangle.length === 3) {
      triangles.push(triangle);
      triangle = [];
    }
  }
  return triangles;
}

/**
 * Decodes ASCII text, in chunks small enough to pass as arguments.
 * @param {Uint8Array} bytes
 */
function decodeAscii(bytes) {
  let text = "";
  for (let at = 0; at < bytes.length; at += 8192) {
    text += String.fromCharCode(...bytes.subarray(at, at + 8192));
  }
  return text;
}

/**
 * Reads an STL file's triangles, scaled to meters.
 * @param {Uint8Array} bytes
 * @param {number} scale
 */
export function readStl(bytes, scale) {
  if (isBinaryStl(bytes)) {
    return readBinary(bytes, scale);
  }
  const text = decodeAscii(bytes);
  const triangles = readAscii(text, scale);
  // Some files that claim to be ASCII hold binary facets, but an ASCII file that ends its solid
  // is ASCII, empty or not.
  if (triangles.length > 0 || bytes.length < kHeaderBytes + 4 || /\bendsolid\b/.test(text)) {
    return triangles;
  }
  return readBinary(bytes, scale);
}

/**
 * Collects the triangles of the visible faces in entities and the groups and components in
 * them, in the coordinates transformation maps to, each counterclockwise around its outside.
 * @param {Iterable<modlumi.DrawingElement>} elements
 * @param {modlumi.Transformation} transformation
 * @param {Triangle[]} triangles
 */
function collectTriangles(elements, transformation, triangles) {
  // A mirroring transformation turns counterclockwise triangles clockwise.
  const [x, y, z] = [[1, 0, 0], [0, 1, 0], [0, 0, 1]].map((axis) => new modlumi.Vector3d(...axis).transform(transformation));
  const mirrored = x.dot(y.cross(z)) < 0;
  for (const element of elements) {
    if (element.hidden) {
      continue;
    }
    if (element instanceof modlumi.Face) {
      for (const triangle of element.triangles) {
        const [a, b, c] = triangle.map((point) => point.transform(transformation));
        triangles.push(mirrored ? [a, c, b] : [a, b, c]);
      }
    } else if (element instanceof modlumi.Group) {
      collectTriangles(element.entities, transformation.multiply(element.transformation), triangles);
    } else if (element instanceof modlumi.ComponentInstance) {
      collectTriangles(element.definition.entities, transformation.multiply(element.transformation), triangles);
    }
  }
}

/**
 * Returns a triangle's unit normal by the right-hand rule, or zero for a degenerate one.
 * @param {Triangle} triangle
 */
function getNormal([a, b, c]) {
  const normal = a.vectorTo(b).cross(a.vectorTo(c));
  const length = Math.hypot(normal.x, normal.y, normal.z);
  return length > 0 ? normal.scale(1 / length) : normal;
}

/**
 * Writes triangles as a binary STL file, in units of scale per meter.
 * @param {Triangle[]} triangles
 * @param {number} scale
 * @param {string} name
 */
export function writeBinary(triangles, scale, name) {
  const bytes = new Uint8Array(kHeaderBytes + 4 + triangles.length * kFacetBytes);
  // The header is ASCII; other characters become question marks.
  const header = `Modlumi STL ${name}`.slice(0, kHeaderBytes);
  for (let index = 0; index < header.length; ++index) {
    const code = header.charCodeAt(index);
    bytes[index] = code < 128 ? code : 63;
  }
  const view = new DataView(bytes.buffer);
  view.setUint32(kHeaderBytes, triangles.length, true);
  triangles.forEach((triangle, facet) => {
    let at = kHeaderBytes + 4 + facet * kFacetBytes;
    const normal = getNormal(triangle);
    for (const value of [normal.x, normal.y, normal.z]) {
      view.setFloat32(at, value, true);
      at += 4;
    }
    for (const point of triangle) {
      for (const value of [point.x, point.y, point.z]) {
        view.setFloat32(at, value * scale, true);
        at += 4;
      }
    }
  });
  return bytes;
}

/**
 * Writes triangles as an ASCII STL file, in units of scale per meter.
 * @param {Triangle[]} triangles
 * @param {number} scale
 * @param {string} name
 */
export function writeAscii(triangles, scale, name) {
  const lines = [`solid ${name}`];
  for (const triangle of triangles) {
    const normal = getNormal(triangle);
    lines.push(`facet normal ${normal.x} ${normal.y} ${normal.z}`, "  outer loop");
    for (const point of triangle) {
      lines.push(`    vertex ${point.x * scale} ${point.y * scale} ${point.z * scale}`);
    }
    lines.push("  endloop", "endfacet");
  }
  lines.push(`endsolid ${name}`);
  return lines.join("\n") + "\n";
}

/**
 * Returns a file's name without its extension.
 * @param {string} name
 */
function getStem(name) {
  return name.replace(/\.[^.]*$/, "") || "Untitled";
}

/** @param {modlumi.PluginContext} context */
export function activate(context) {
  /** @returns {Options} */
  const getOptions = () => ({ ...kDefaults, ...context.settings.get("options", {}) });

  context.registerImporter({
    id: "stl",
    name: "STL Model",
    extensions: ["stl"],
    import(file) {
      const options = getOptions();
      const triangles = readStl(file.readBytes(), kMeters[options.importUnits] ?? 0.001);
      const mesh = new modlumi.MeshBuilder();
      let skipped = 0;
      for (const triangle of triangles) {
        // Triangles with a zero side or area make no face.
        const [a, b, c] = triangle.map((point) => new modlumi.Point3d(...point));
        if (a.vectorTo(b).cross(a.vectorTo(c)).dot(a.vectorTo(b).cross(a.vectorTo(c))) <= 1e-24) {
          skipped += 1;
          continue;
        }
        mesh.addPolygon([a, b, c]);
      }
      if (mesh.polygonCount === 0) {
        context.showMessage(`${file.name} holds no triangles to import.`);
        return;
      }
      const group = model.activeEntities.addGroup();
      group.name = getStem(file.name);
      group.entities.addMesh(mesh);
      if (options.mergeFaces) {
        group.entities.mergeCoplanarFaces({ sameMaterials: true });
      }
      if (!options.preserveOrigin) {
        const bounds = group.entities.bounds;
        if (bounds !== null) {
          group.transform(modlumi.Transformation.translation(bounds.min.vectorTo([0, 0, 0])));
        }
      }
      context.showMessage(`Imported ${mesh.polygonCount} triangles from ${file.name}` +
        (skipped > 0 ? `, skipping ${skipped} degenerate ones` : ""));
    },
  });

  context.registerExporter({
    id: "stl",
    name: "STL Model",
    extensions: ["stl"],
    export(file) {
      const options = getOptions();
      const elements = options.selectionOnly && model.selection.length > 0
        ? model.selection.toArray() : model.activeEntities;
      /** @type {Triangle[]} */
      const triangles = [];
      collectTriangles(elements, model.activeTransformation, triangles);
      const unit = options.exportUnits === "Model Units"
        ? kModelUnits[model.units.lengthUnit] ?? "Millimeters" : options.exportUnits;
      const scale = 1 / kMeters[unit];
      const name = getStem(file.name);
      if (options.format === "ASCII") {
        file.writeText(writeAscii(triangles, scale, name));
      } else {
        file.writeBytes(writeBinary(triangles, scale, name));
      }
      context.showMessage(`Exported ${triangles.length} triangles to ${file.name}, in ${unit.toLowerCase()}`);
    },
  });

  context.registerCommand({
    id: "options",
    title: "STL Options...",
    tip: "Sets the units and other options STL import and export use.",
    run() {
      /** @type {Options} */
      const options = getOptions();
      context.showDialog({
        id: "options",
        title: "STL Options",
        modal: true,
        draw(ui) {
          ui.heading("Import");
          options.importUnits = /** @type {Unit} */ (ui.dropdown("Units", options.importUnits, kUnits,
            { tip: "STL files have no units; this says what theirs are" }));
          options.mergeFaces = ui.checkbox("Merge coplanar faces", options.mergeFaces,
            { tip: "Joins the triangles of flat surfaces into one face" });
          options.preserveOrigin = ui.checkbox("Preserve drawing origin", options.preserveOrigin,
            { tip: "Otherwise moves the import so its bounds start at the origin" });
          ui.heading("Export");
          options.exportUnits = /** @type {Unit | "Model Units"} */ (ui.dropdown("Units", options.exportUnits,
            ["Model Units", ...kUnits]));
          options.format = /** @type {"Binary" | "ASCII"} */ (ui.dropdown("Format", options.format, ["Binary", "ASCII"]));
          options.selectionOnly = ui.checkbox("Export only the selection", options.selectionOnly);
          ui.spacing();
          ui.row(() => {
            if (ui.button("OK", { primary: true })) {
              context.settings.set("options", options);
              ui.close();
            }
            if (ui.button("Cancel")) {
              ui.close();
            }
          });
        },
      });
    },
  });
}
