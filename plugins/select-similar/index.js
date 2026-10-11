// Grows the selection to faces that match the selected ones, or filters it by type.
// Inspired by the selection commands in ThomThom's Selection Tools.

// Faces closer than this, in meters, or whose normals differ less than this, in radians, match.
const kDistanceTolerance = 1e-6;
const kAngleTolerance = 1e-6;

/** @typedef {{ normal: modlumi.Vector3d, distance: number }} Plane */

/**
 * @param {modlumi.Entity} element
 * @returns {element is modlumi.Face}
 */
function isFace(element) {
  return element instanceof modlumi.Face;
}

/**
 * @param {modlumi.Model} model
 * @returns {modlumi.Face[]}
 */
function selectedFaces(model) {
  return model.selection.toArray().filter(isFace);
}

/**
 * @param {modlumi.Model} model
 * @returns {modlumi.Face[]}
 */
function contextFaces(model) {
  return model.activeEntities.toArray().filter(isFace);
}

// Returns a face's unit normal and its plane's signed distance from the origin, or null for a
// face without a normal.
/**
 * @param {modlumi.Face} face
 * @returns {Plane | null}
 */
function planeOf(face) {
  const normal = face.normal;
  if (normal === null) {
    return null;
  }
  const point = face.outerLoop.edges[0].start.position;
  return { normal, distance: normal.dot(point.toArray()) };
}

/**
 * @param {modlumi.Vector3d} a
 * @param {modlumi.Vector3d} b
 */
function isParallel(a, b) {
  return Math.abs(Math.abs(a.dot(b)) - 1) <= kAngleTolerance;
}

/**
 * @param {modlumi.Vector3d} a
 * @param {modlumi.Vector3d} b
 */
function isSameDirection(a, b) {
  return Math.abs(a.dot(b) - 1) <= kAngleTolerance;
}

// Whether two planes coincide, whichever way their normals point.
/**
 * @param {Plane} a
 * @param {Plane} b
 */
function isCoplanar(a, b) {
  if (!isParallel(a.normal, b.normal)) {
    return false;
  }
  const distance = a.normal.dot(b.normal) > 0 ? b.distance : -b.distance;
  return Math.abs(a.distance - distance) <= kDistanceTolerance;
}

// Adds the faces of the active context that match any selected face, and reports how many.
/**
 * @param {modlumi.PluginContext} context
 * @param {string} describe
 * @param {(seed: modlumi.Face, face: modlumi.Face) => boolean} matches
 */
function growSelection(context, describe, matches) {
  const model = modlumi.activeModel;
  const seeds = selectedFaces(model);
  if (seeds.length === 0) {
    context.showMessage("Select at least one face first.");
    return;
  }
  let added = 0;
  for (const face of contextFaces(model)) {
    const matching = seeds.some((seed) => matches(seed, face));
    if (matching && !model.selection.has(face) && model.selection.add(face)) {
      added += 1;
    }
  }
  const faces = added === 1 ? "face" : "faces";
  context.showMessage(added === 0 ? `No more ${describe} faces.` : `Added ${added} ${describe} ${faces}.`);
}

// Adds faces reachable from the selected ones through shared edges while staying on their plane.
/** @param {modlumi.PluginContext} context */
function selectConnectedPlanar(context) {
  const model = modlumi.activeModel;
  const seeds = selectedFaces(model);
  if (seeds.length === 0) {
    context.showMessage("Select at least one face first.");
    return;
  }
  /** @type {Map<modlumi.Edge, modlumi.Face[]>} */
  const facesByEdge = new Map();
  for (const face of contextFaces(model)) {
    for (const loop of face.loops) {
      for (const edge of loop.edges) {
        const faces = facesByEdge.get(edge) ?? [];
        faces.push(face);
        facesByEdge.set(edge, faces);
      }
    }
  }
  const reached = new Set(seeds);
  const pending = [...seeds];
  let added = 0;
  while (pending.length > 0) {
    const face = /** @type {modlumi.Face} */ (pending.pop());
    const plane = planeOf(face);
    if (plane === null) {
      continue;
    }
    for (const loop of face.loops) {
      for (const edge of loop.edges) {
        for (const neighbor of facesByEdge.get(edge) ?? []) {
          const other = planeOf(neighbor);
          if (reached.has(neighbor) || other === null || !isCoplanar(plane, other)) {
            continue;
          }
          reached.add(neighbor);
          pending.push(neighbor);
          if (model.selection.add(neighbor)) {
            added += 1;
          }
        }
      }
    }
  }
  const faces = added === 1 ? "face" : "faces";
  context.showMessage(added === 0 ? "No more connected faces on the same plane." : `Added ${added} connected ${faces}.`);
}

// Keeps only the selected elements that pass keep, and reports what was removed.
/**
 * @param {modlumi.PluginContext} context
 * @param {string} describe
 * @param {(element: modlumi.DrawingElement) => boolean} keep
 */
function filterSelection(context, describe, keep) {
  const selection = modlumi.activeModel.selection;
  let removed = 0;
  for (const element of selection.toArray()) {
    if (!keep(element) && selection.remove(element)) {
      removed += 1;
    }
  }
  const items = removed === 1 ? "item" : "items";
  context.showMessage(`Kept ${selection.length} ${describe}; removed ${removed} other ${items}.`);
}

/** @param {modlumi.PluginContext} context */
export function activate(context) {
  /**
   * @param {string} id
   * @param {string} title
   * @param {string} tip
   * @param {string} describe
   * @param {(seed: modlumi.Face, face: modlumi.Face) => boolean} matches
   */
  const grow = (id, title, tip, describe, matches, contextMenu = false) =>
    context.registerCommand({
      id,
      title,
      tip,
      when: "selection",
      contextMenu,
      run: () => growSelection(context, describe, matches),
    });
  grow(
    "coplanar-faces",
    "Select Coplanar Faces",
    "Adds every face in the current context that lies on the plane of a selected face.",
    "coplanar",
    (seed, face) => {
      const a = planeOf(seed);
      const b = planeOf(face);
      return a !== null && b !== null && isCoplanar(a, b);
    },
    true,
  );
  grow(
    "parallel-faces",
    "Select Parallel Faces",
    "Adds every face in the current context that is parallel to a selected face, facing either way.",
    "parallel",
    (seed, face) => seed.normal !== null && face.normal !== null && isParallel(seed.normal, face.normal),
  );
  grow(
    "same-direction-faces",
    "Select Faces Facing the Same Way",
    "Adds every face in the current context whose front faces the same direction as a selected face.",
    "same-direction",
    (seed, face) => seed.normal !== null && face.normal !== null && isSameDirection(seed.normal, face.normal),
  );
  grow(
    "same-material-faces",
    "Select Faces with the Same Material",
    "Adds every face in the current context whose front material matches a selected face.",
    "same-material",
    (seed, face) => seed.material === face.material,
    true,
  );
  context.registerCommand({
    id: "connected-planar-faces",
    title: "Select Connected Faces on the Same Plane",
    tip: "Adds the faces that connect to a selected face through shared edges without leaving its plane.",
    when: "selection",
    contextMenu: true,
    run: () => selectConnectedPlanar(context),
  });
  /** @type {{ id: string, title: string, describe: string, keep: (element: modlumi.DrawingElement) => boolean }[]} */
  const filters = [
    { id: "keep-faces", title: "Keep Only Faces", describe: "faces", keep: isFace },
    {
      id: "keep-edges",
      title: "Keep Only Edges",
      describe: "edges",
      keep: (element) => element instanceof modlumi.Edge,
    },
    {
      id: "keep-containers",
      title: "Keep Only Groups and Components",
      describe: "groups and components",
      keep: (element) => element instanceof modlumi.Group || element instanceof modlumi.ComponentInstance,
    },
  ];
  for (const { id, title, describe, keep } of filters) {
    context.registerCommand({
      id,
      title,
      tip: `Removes everything but ${describe} from the selection.`,
      when: "selection",
      run: () => filterSelection(context, describe, keep),
    });
  }
}
