// Wavefront OBJ import and export. OBJ files list vertices ("v"), and faces ("f") through them,
// grouped into objects ("o") or groups ("g"); they have no units, and most tools write them
// with Y up. Import makes a group per object inside one group for the file; export writes the
// faces of each group and component as an object of its own.

/**
 * @typedef {"Millimeters" | "Centimeters" | "Meters" | "Inches" | "Feet"} Unit
 * @typedef {{ units: Unit, yUp: boolean }} Options
 * @typedef {{ name: string, polygons: number[][][] }} ObjObject
 */

const model = modlumi.activeModel;
/** Meters per unit. @type {Record<Unit, number>} */
const kMeters = { Millimeters: 0.001, Centimeters: 0.01, Meters: 1, Inches: 0.0254, Feet: 0.3048 };
/** @type {Unit[]} */
const kUnits = ["Meters", "Centimeters", "Millimeters", "Inches", "Feet"];
/** @type {Options} */
const kDefaults = { units: "Meters", yUp: true };

/**
 * Reads OBJ text into its objects' polygons, as points in meters with Z up. Faces refer to
 * vertices by position from 1, or from the end with negative numbers; texture coordinates and
 * normals after slashes are left out.
 * @param {string} text
 * @param {Options} options
 * @returns {ObjObject[]}
 */
export function readObj(text, options) {
  const scale = kMeters[options.units] ?? 1;
  /** @type {number[][]} */
  const vertices = [];
  /** @type {ObjObject[]} */
  const objects = [];
  /** @type {ObjObject | null} */
  let current = null;
  /** Objects "g" records started since the last "o", by name. @type {Map<string, ObjObject>} */
  const groups = new Map();
  // A backslash at a line's end continues the record on the next line, and "#" starts a comment.
  const records = text.replace(/\\\r?\n/g, " ").split(/\r?\n/).map((line) => line.replace(/#.*/, ""));
  for (const record of records) {
    const words = record.trim().split(/\s+/);
    if (words[0] === "v" && words.length >= 4) {
      const [x, y, z] = words.slice(1, 4).map((value) => Number(value) * scale);
      vertices.push(options.yUp ? [x, -z, y] : [x, y, z]);
    } else if (words[0] === "o" || words[0] === "g") {
      // Each "o" starts an object, even one with an earlier one's name; a "g" naming an earlier
      // group of the same object selects it again.
      const name = words.slice(1).join(" ") || "Object";
      const group = words[0] === "g";
      if (!group) {
        groups.clear();
      }
      current = group ? groups.get(name) ?? null : null;
      if (current === null) {
        current = { name, polygons: [] };
        objects.push(current);
        if (group) {
          groups.set(name, current);
        }
      }
    } else if (words[0] === "f" && words.length >= 4) {
      const corners = [];
      for (const word of words.slice(1)) {
        const index = Number.parseInt(word.split("/")[0], 10);
        const vertex = vertices[index < 0 ? vertices.length + index : index - 1];
        if (vertex === undefined || !vertex.every(Number.isFinite)) {
          corners.length = 0;
          break;
        }
        corners.push(vertex);
      }
      if (corners.length >= 3) {
        if (current === null) {
          current = { name: "Object", polygons: [] };
          objects.push(current);
        }
        current.polygons.push(corners);
      }
    }
  }
  return objects.filter((object) => object.polygons.length > 0);
}

/**
 * Returns a polygon's corners with repeated neighbors left out, or null when fewer than three
 * different ones remain or they lie on a line.
 * @param {number[][]} polygon
 */
function cleanPolygon(polygon) {
  const points = polygon.map((point) => new modlumi.Point3d(...point))
    .filter((point, index, all) => !point.equals(all[(index + all.length - 1) % all.length]));
  if (points.length < 3) {
    return null;
  }
  let area = new modlumi.Vector3d(0, 0, 0);
  for (let index = 1; index + 1 < points.length; ++index) {
    area = area.add(points[0].vectorTo(points[index]).cross(points[0].vectorTo(points[index + 1])));
  }
  return area.dot(area) > 1e-24 ? points : null;
}

/**
 * Returns a face's outer boundary as positions, counterclockwise around its normal.
 * @param {modlumi.Face} face
 */
function getOutline(face) {
  const points = face.outerLoop.edgeUses.map((use) => use.start.position);
  let normal = new modlumi.Vector3d(0, 0, 0);
  for (let index = 0; index < points.length; ++index) {
    const a = points[index];
    const b = points[(index + 1) % points.length];
    normal = normal.add(new modlumi.Vector3d((a.y - b.y) * (a.z + b.z), (a.z - b.z) * (a.x + b.x), (a.x - b.x) * (a.y + b.y)));
  }
  return face.normal !== null && normal.dot(face.normal) < 0 ? points.reverse() : points;
}

/**
 * Writes the faces of elements and the groups and components in them as OBJ text, in world
 * coordinates, with an object per group and component. Faces with holes are written as their
 * triangles.
 * @param {Iterable<modlumi.DrawingElement>} elements
 * @param {Options} options
 */
export function writeObj(elements, options) {
  const scale = 1 / (kMeters[options.units] ?? 1);
  const lines = ["# Exported by Modlumi"];
  /** @type {Map<string, number>} */
  const indices = new Map();
  /** @param {modlumi.Point3d} point */
  const vertex = (point) => {
    const [x, y, z] = [point.x * scale, point.y * scale, point.z * scale];
    const written = (options.yUp ? [x, z, -y] : [x, y, z]).map((value) => (Object.is(value, -0) ? 0 : value));
    const key = written.join(" ");
    let index = indices.get(key);
    if (index === undefined) {
      index = indices.size + 1;
      indices.set(key, index);
      lines.push(`v ${key}`);
    }
    return index;
  };
  let faces = 0;
  /**
   * @param {Iterable<modlumi.DrawingElement>} list
   * @param {modlumi.Transformation} transformation
   * @param {string} name
   */
  const visit = (list, transformation, name) => {
    const [x, y, z] = [[1, 0, 0], [0, 1, 0], [0, 0, 1]].map((axis) => new modlumi.Vector3d(...axis).transform(transformation));
    const mirrored = x.dot(y.cross(z)) < 0;
    const shown = Array.from(list).filter((element) => !element.hidden);
    // All of this object's faces first, so none follow a child's "o" record.
    const own = shown.filter((element) => element instanceof modlumi.Face);
    if (own.length > 0) {
      lines.push(`o ${name}`);
    }
    for (const face of /** @type {modlumi.Face[]} */ (own)) {
      const polygons = face.loops.length === 1 ? [getOutline(face)] : face.triangles;
      for (const polygon of polygons) {
        const placed = polygon.map((point) => vertex(point.transform(transformation)));
        lines.push(`f ${(mirrored ? placed.reverse() : placed).join(" ")}`);
        faces += 1;
      }
    }
    for (const element of shown) {
      if (element instanceof modlumi.Group) {
        visit(element.entities, transformation.multiply(element.transformation), element.name || "Group");
      } else if (element instanceof modlumi.ComponentInstance) {
        visit(element.definition.entities, transformation.multiply(element.transformation),
          element.name || element.definition.name);
      }
    }
  };
  visit(elements, model.activeTransformation, "Model");
  return { text: lines.join("\n") + "\n", faces };
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
    id: "obj",
    name: "OBJ Model",
    extensions: ["obj"],
    import(file) {
      const objects = readObj(file.readText(), getOptions());
      let imported = 0;
      const group = model.activeEntities.addGroup();
      group.name = getStem(file.name);
      for (const object of objects) {
        const mesh = new modlumi.MeshBuilder();
        for (const polygon of object.polygons) {
          const points = cleanPolygon(polygon);
          if (points !== null) {
            mesh.addPolygon(points);
          }
        }
        if (mesh.polygonCount === 0) {
          continue;
        }
        // One object is the file's group itself; several are groups inside it.
        const holder = objects.length === 1 ? group : group.entities.addGroup();
        if (holder !== group) {
          holder.name = object.name;
        }
        holder.entities.addMesh(mesh);
        imported += mesh.polygonCount;
      }
      if (imported === 0) {
        model.activeEntities.erase(group);
        context.showMessage(`${file.name} holds no faces to import.`);
        return;
      }
      context.showMessage(`Imported ${imported} faces from ${file.name}`);
    },
  });

  context.registerExporter({
    id: "obj",
    name: "OBJ Model",
    extensions: ["obj"],
    export(file) {
      const { text, faces } = writeObj(model.activeEntities, getOptions());
      file.writeText(text);
      context.showMessage(`Exported ${faces} faces to ${file.name}`);
    },
  });

  context.registerCommand({
    id: "options",
    title: "OBJ Options...",
    tip: "Sets the units and up axis OBJ import and export use.",
    run() {
      const options = getOptions();
      context.showDialog({
        id: "options",
        title: "OBJ Options",
        modal: true,
        draw(ui) {
          options.units = /** @type {Unit} */ (ui.dropdown("Units", options.units, kUnits,
            { tip: "OBJ files have no units; this says what theirs are" }));
          options.yUp = ui.checkbox("Y is up", options.yUp, { tip: "As most other tools write OBJ files" });
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
