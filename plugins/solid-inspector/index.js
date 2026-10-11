// Finds what keeps a group or component from being a solid: holes, stray edges, internal and
// external faces, reversed faces, hidden faces and nested instances. The tool shows each in
// the model, lists them in its options and fixes what it can in one undo step.
//
// A port of Solid Inspector² (https://github.com/thomthom/solid-inspector), whose shell
// resolution is based on Shellify by Anders Lyhagen:
//
// Copyright (c) 2010-2014 Thomas Thomassen
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
 * @typedef {"reversedFace" | "internalFace" | "externalFace" | "strayEdge" | "faceHole" | "hiddenFace"
 *   | "surfaceBorder" | "internalFaceEdge" | "sharedEdge" | "nestedInstance" | "shortEdge"} ErrorKind
 * @typedef {"erase" | "reverse" | "show" | null} Fix
 * @typedef {{
 *   kind: ErrorKind,
 *   entities: modlumi.DrawingElement[],
 *   triangles: modlumi.Point3d[][],
 *   lines: modlumi.Point3d[],
 * }} SolidError
 * @typedef {{
 *   entities: modlumi.Entities,
 *   transformation: modlumi.Transformation,
 *   name: string,
 * }} Target
 */

const model = modlumi.activeModel;
const kTwoPi = Math.PI * 2;
/** @type {modlumi.Color} */
const kEdgeColor = { r: 1, g: 0, b: 0, a: 1 };
/** @type {modlumi.Color} */
const kFaceColor = { r: 1, g: 0, b: 0, a: 0.5 };
/** @type {modlumi.Color} */
const kCurrentEdgeColor = { r: 1, g: 0.58, b: 0.03, a: 1 };
/** @type {modlumi.Color} */
const kCurrentFaceColor = { r: 1, g: 0.58, b: 0.03, a: 0.6 };

/** @type {Record<ErrorKind, { name: string, fix: Fix, description: string }>} */
const kErrorKinds = {
  reversedFace: {
    name: "Reversed Faces",
    fix: "reverse",
    description: "The front of every face of a solid must face outward, or many applications won't treat it as " +
      "a solid. Fixed by reversing the faces.",
  },
  internalFace: {
    name: "Internal Faces",
    fix: "erase",
    description: "Faces inside a mesh that should be a solid. Fixed by erasing them.",
  },
  externalFace: {
    name: "External Faces",
    fix: "erase",
    description: "Faces sticking out of a mesh that should be a solid. Fixed by erasing them.",
  },
  strayEdge: {
    name: "Stray Edges",
    fix: "erase",
    description: "Edges that bound no face, so they aren't part of any solid. Fixed by erasing them.",
  },
  faceHole: {
    name: "Face Holes",
    fix: "erase",
    description: "Edges that cut a hole in a face. Fixed by erasing the hole's edges.",
  },
  hiddenFace: {
    name: "Hidden Faces",
    fix: "show",
    description: "Hidden faces aren't exported to STL files and may leave holes in the mesh. Fixed by showing them.",
  },
  surfaceBorder: {
    name: "Surface Borders",
    fix: null,
    description: "Edges that bound only one face: the border of a surface or a hole in the mesh. These can't be " +
      "fixed automatically: close the mesh by hand and inspect it again.",
  },
  internalFaceEdge: {
    name: "Internal Face Edges",
    fix: null,
    description: "Edges of internal faces. While the mesh has holes, it isn't possible to tell which faces are " +
      "internal: fix the holes and inspect it again.",
  },
  sharedEdge: {
    name: "Shared Edges",
    fix: null,
    description: "Edges where closed volumes meet, so they don't form one solid. These can't be fixed " +
      "automatically: move the volumes apart or join them into one.",
  },
  nestedInstance: {
    name: "Nested Instances",
    fix: null,
    description: "Solid tools don't count groups and components inside a solid as part of it. Explode them to " +
      "make their geometry part of the solid.",
  },
  shortEdge: {
    name: "Short Edges",
    fix: null,
    description: "Very small geometry can give unpredictable results through precision errors. These can't be " +
      "fixed automatically; scaling the model up by a factor of 10 can work around them.",
  },
};

// The order errors are listed and cycled through.
const kKindOrder = /** @type {ErrorKind[]} */ (Object.keys(kErrorKinds));

/**
 * Returns the vector from the start of the edge to its end.
 * @param {modlumi.Edge} edge
 */
function edgeDirection(edge) {
  return edge.start.position.vectorTo(edge.end.position);
}

// The faces, edges and vertices of one drawing context, with what the shell resolution looks up
// often, by entity id.
class Mesh {
  /**
   * @param {modlumi.Face[]} faces
   * @param {modlumi.Edge[]} edges
   */
  constructor(faces, edges) {
    this.faces = faces;
    this.edges = edges;
    /** @type {Map<number, modlumi.Face[]>} */
    this.edgeFaces = new Map();
    /** @type {Map<number, modlumi.Edge[]>} The edges of each face's loops. */
    this.faceEdges = new Map();
    /** @type {Map<number, Map<number, boolean>>} Whether each face's loop runs along an edge backward. */
    this.reversedUses = new Map();
    /** @type {Map<number, modlumi.Vector3d>} */
    this.normals = new Map();
    /** @type {Map<number, modlumi.Edge[]>} */
    this.vertexEdges = new Map();
    /** @type {Map<number, modlumi.Vertex>} */
    this.vertices = new Map();
    for (const face of faces) {
      const uses = new Map();
      const loopEdges = [];
      for (const loop of face.loops) {
        for (const use of loop.edgeUses) {
          uses.set(use.edge.entityId, use.isReversed);
          loopEdges.push(use.edge);
        }
      }
      this.reversedUses.set(face.entityId, uses);
      this.faceEdges.set(face.entityId, loopEdges);
      this.normals.set(face.entityId, face.normal ?? new modlumi.Vector3d(0, 0, 0));
    }
    for (const edge of edges) {
      this.edgeFaces.set(edge.entityId, [...edge.faces]);
      for (const vertex of [edge.start, edge.end]) {
        this.vertices.set(vertex.entityId, vertex);
        const at = this.vertexEdges.get(vertex.entityId);
        if (at === undefined) {
          this.vertexEdges.set(vertex.entityId, [edge]);
        } else {
          at.push(edge);
        }
      }
    }
  }

  /** @param {modlumi.Edge} edge */
  getEdgeFaces(edge) {
    return this.edgeFaces.get(edge.entityId) ?? [];
  }

  /** @param {modlumi.Vertex} vertex */
  getVertexEdges(vertex) {
    return this.vertexEdges.get(vertex.entityId) ?? [];
  }
}

// Resolves the outer shell of a mesh: the faces that would form a closed solid, the internal and
// external faces that don't belong to it, and the shell faces that face inward.
class Shell {
  /** @param {Mesh} mesh */
  constructor(mesh) {
    this.mesh = mesh;
    /** @type {Set<number>} */
    this.shellFaces = new Set();
    /** @type {Set<number>} */
    this.internalFaces = new Set();
    /** @type {Set<number>} */
    this.externalFaces = new Set();
    /** @type {Set<number>} */
    this.reversedFaces = new Set();
  }

  resolve() {
    const groups = this.findGeometryGroups();
    if (groups.length < 2) {
      this.resolveGroups(groups, [0]);
      return;
    }
    // A part inside another, such as a cavity's boundary, faces the other way. Which faces
    // form each part's shell doesn't depend on that, so find them first, and count how many
    // other shells enclose each part without partitions and flaps in the way.
    const probe = new Shell(this.mesh);
    probe.resolveGroups(groups, groups.map(() => 0));
    this.resolveGroups(groups, getNestingDepths(this.mesh, groups, probe.shellFaces));
  }

  /**
   * Resolves the shell of each part of the mesh, facing out at an even nesting depth.
   * @param {modlumi.Edge[][]} groups
   * @param {number[]} depths
   */
  resolveGroups(groups, depths) {
    const allFaces = this.mesh.faces.map((face) => face.entityId);
    // First a shell of the faces oriented outward.
    const front = new Set();
    for (const [index, group] of groups.entries()) {
      const start = this.findStartFace(group, depths[index] % 2 === 0);
      if (start !== null) {
        for (const face of this.findShell(start)) {
          front.add(face);
        }
      }
    }
    // The faces it doesn't reach are internal; it may still hold external "flaps".
    this.internalFaces = new Set(allFaces.filter((face) => !front.has(face)));
    // findShell changes the reversed faces, so keep the first pass's to restore them.
    const firstReversed = new Set(this.reversedFaces);
    // A second shell, looking for normals the other way, tells external faces apart.
    const back = new Set();
    for (const [index, group] of groups.entries()) {
      const start = this.findStartFace(group, depths[index] % 2 === 1);
      if (start !== null) {
        for (const face of this.findShell(start)) {
          back.add(face);
        }
      }
    }
    this.shellFaces = new Set([...front].filter((face) => back.has(face)));
    this.externalFaces = new Set(
      allFaces.filter((face) => !this.internalFaces.has(face) && !this.shellFaces.has(face)));
    this.reversedFaces = new Set([...this.shellFaces].filter((face) => firstReversed.has(face)));
  }

  // Whether the shell forms a manifold: every edge of its faces bounds two or more of them.
  isValid() {
    if (this.shellFaces.size === 0) {
      return false;
    }
    for (const face of this.shellFaces) {
      for (const edge of this.mesh.faceEdges.get(face) ?? []) {
        if (this.mesh.getEdgeFaces(edge).filter((other) => this.shellFaces.has(other.entityId)).length < 2) {
          return false;
        }
      }
    }
    return true;
  }

  // Returns the edges of each part of the mesh whose faces connect through shared edges. Parts
  // that only touch at a vertex or through stray edges are separate, so each gets its own shell.
  findGeometryGroups() {
    /** @type {modlumi.Edge[][]} */
    const groups = [];
    const visited = new Set();
    for (const seed of this.mesh.faces) {
      if (visited.has(seed.entityId)) {
        continue;
      }
      visited.add(seed.entityId);
      /** @type {Map<number, modlumi.Edge>} */
      const edges = new Map();
      const stack = [seed];
      while (stack.length > 0) {
        const face = /** @type {modlumi.Face} */ (stack.pop());
        for (const edge of this.mesh.faceEdges.get(face.entityId) ?? []) {
          edges.set(edge.entityId, edge);
          for (const next of this.mesh.getEdgeFaces(edge)) {
            if (!visited.has(next.entityId)) {
              visited.add(next.entityId);
              stack.push(next);
            }
          }
        }
      }
      groups.push([...edges.values()]);
    }
    return groups;
  }

  /**
   * The faces at an edge that aren't known to be internal.
   * @param {modlumi.Edge} edge
   */
  getFaces(edge) {
    return this.mesh.getEdgeFaces(edge).filter((face) => !this.internalFaces.has(face.entityId));
  }

  /** @param {modlumi.Face} face */
  getNormal(face) {
    const normal = /** @type {modlumi.Vector3d} */ (this.mesh.normals.get(face.entityId));
    return this.reversedFaces.has(face.entityId) ? normal.negate() : normal;
  }

  /**
   * @param {modlumi.Edge} edge
   * @param {modlumi.Face} face
   */
  isEdgeReversedIn(edge, face) {
    const reversed = this.mesh.reversedUses.get(face.entityId)?.get(edge.entityId) ?? false;
    return this.reversedFaces.has(face.entityId) ? !reversed : reversed;
  }

  /** @param {modlumi.Face} face */
  reverseFace(face) {
    if (!this.reversedFaces.delete(face.entityId)) {
      this.reversedFaces.add(face.entityId);
    }
  }

  /**
   * Finds a face on the shell: at the highest vertex, along its edge least aligned with the z
   * axis, the face whose normal is closest to it, turned up for the outside or down for the
   * inside. It can't pick the right side of a face at a hole whose normal is horizontal.
   * @param {modlumi.Edge[]} edges
   * @param {boolean} outside
   * @returns {modlumi.Face | null}
   */
  findStartFace(edges, outside) {
    // Only the group's own edges count: another part may touch it at a vertex.
    const own = new Set(edges.map((edge) => edge.entityId));
    /** @type {modlumi.Vertex | null} */
    let highest = null;
    for (const edge of edges) {
      for (const vertex of [edge.start, edge.end]) {
        if ((highest === null || vertex.position.z > highest.position.z) && this.getFaces(edge).length > 0) {
          highest = vertex;
        }
      }
    }
    if (highest === null) {
      return null;
    }
    /** @type {modlumi.Edge | null} */
    let edge = null;
    let flattest = Infinity;
    for (const candidate of this.mesh.getVertexEdges(highest)) {
      const z = Math.abs(edgeDirection(candidate).normalize().z);
      if (own.has(candidate.entityId) && this.getFaces(candidate).length > 0 && z < flattest) {
        flattest = z;
        edge = candidate;
      }
    }
    if (edge === null) {
      return null;
    }
    /** @type {modlumi.Face | null} */
    let face = null;
    let steepest = -Infinity;
    for (const candidate of this.getFaces(edge)) {
      const z = Math.abs(this.getNormal(candidate).z);
      if (z > steepest) {
        steepest = z;
        face = candidate;
      }
    }
    if (face === null) {
      return null;
    }
    const z = this.getNormal(face).z;
    if (outside ? z < 0 : z > 0) {
      this.reverseFace(face);
    }
    return face;
  }

  /**
   * A vector along the edge in the direction the face's loop runs.
   * @param {modlumi.Edge} edge
   * @param {modlumi.Face} face
   */
  getEdgeVector(edge, face) {
    return this.isEdgeReversedIn(edge, face) ? edgeDirection(edge).negate() : edgeDirection(edge);
  }

  /**
   * Given a shell face and one of its edges, returns the other shell face at the edge, reversed
   * to match the face, or null.
   * @param {modlumi.Edge} edge
   * @param {modlumi.Face} face
   * @returns {modlumi.Face | null}
   */
  findOtherShellFace(edge, face) {
    const faces = this.getFaces(edge);
    if (faces.length < 2) {
      return null;
    }
    if (faces.length === 2) {
      const other = faces.find((candidate) => candidate.entityId !== face.entityId);
      if (other === undefined) {
        return null;
      }
      if (this.isEdgeReversedIn(edge, face) === this.isEdgeReversedIn(edge, other)) {
        this.reverseFace(other);
      }
      return other;
    }
    // With more faces at the edge, the shell continues into the one at the smallest angle
    // around the edge, turning from the face's back.
    const edgeVector = this.getEdgeVector(edge, face);
    const normal = this.getNormal(face);
    const product = normal.cross(edgeVector);
    const reversed = this.isEdgeReversedIn(edge, face);
    let smallest = kTwoPi;
    /** @type {modlumi.Face | null} */
    let shellFace = null;
    for (const other of faces) {
      if (other.entityId === face.entityId) {
        continue;
      }
      let otherNormal = this.getNormal(other);
      if (this.isEdgeReversedIn(edge, other) === reversed) {
        otherNormal = otherNormal.negate();
      }
      const otherProduct = edgeVector.cross(otherNormal);
      let angle = product.angleBetween(otherProduct);
      if (otherProduct.dot(normal) < 0) {
        angle = kTwoPi - angle;
      }
      if (angle < smallest) {
        smallest = angle;
        shellFace = other;
      }
    }
    if (shellFace === null) {
      return null;
    }
    if (this.isEdgeReversedIn(edge, shellFace) === reversed) {
      this.reverseFace(shellFace);
    }
    return shellFace;
  }

  /**
   * Walks the mesh from a shell face and returns the ids of the faces of its outer shell.
   * @param {modlumi.Face} start
   */
  findShell(start) {
    const stack = [start];
    const processed = new Set([`f${start.entityId}`]);
    /** @type {number[]} */
    const shell = [];
    while (stack.length > 0) {
      const face = /** @type {modlumi.Face} */ (stack.pop());
      shell.push(face.entityId);
      for (const edge of this.mesh.faceEdges.get(face.entityId) ?? []) {
        if (processed.has(`e${edge.entityId}`) || this.getFaces(edge).length < 2) {
          continue;
        }
        processed.add(`e${edge.entityId}`);
        const other = this.findOtherShellFace(edge, face);
        if (other === null || processed.has(`f${other.entityId}`)) {
          continue;
        }
        stack.push(other);
        processed.add(`f${other.entityId}`);
      }
    }
    return shell;
  }
}

// A ray direction unlikely to run along an edge or within a face of modeled geometry.
const kRay = new modlumi.Vector3d(0.5773, 0.5774, 0.5776).normalize();

/**
 * Whether a ray from origin along kRay crosses a triangle, by the Möller-Trumbore test.
 * @param {modlumi.Point3d} origin
 * @param {readonly modlumi.Point3d[]} triangle
 */
function isRayCrossing(origin, [a, b, c]) {
  const ab = a.vectorTo(b);
  const ac = a.vectorTo(c);
  const p = kRay.cross(ac);
  const determinant = ab.dot(p);
  if (Math.abs(determinant) < 1e-12) {
    return false;
  }
  const t = a.vectorTo(origin);
  const u = t.dot(p) / determinant;
  if (u < 0 || u > 1) {
    return false;
  }
  const q = t.cross(ab);
  const v = kRay.dot(q) / determinant;
  return v >= 0 && u + v <= 1 && ac.dot(q) / determinant > 1e-9;
}

/**
 * Returns, for each part of the mesh, how many shells of other parts enclose it.
 * @param {Mesh} mesh
 * @param {modlumi.Edge[][]} groups
 * @param {Set<number>} shellFaces
 */
function getNestingDepths(mesh, groups, shellFaces) {
  const triangles = groups.map((edges) => {
    /** @type {Map<number, modlumi.Face>} */
    const faces = new Map();
    for (const edge of edges) {
      for (const face of mesh.getEdgeFaces(edge)) {
        if (shellFaces.has(face.entityId)) {
          faces.set(face.entityId, face);
        }
      }
    }
    return [...faces.values()].flatMap((face) => {
      try {
        return face.triangles;
      } catch {
        return [];
      }
    });
  });
  return groups.map((_, index) => {
    // The middle of one of the part's own triangles, which no other part can merely touch.
    const triangle = triangles[index][0];
    if (triangle === undefined) {
      return 0;
    }
    const [a, b, c] = triangle;
    const origin = new modlumi.Point3d((a.x + b.x + c.x) / 3, (a.y + b.y + c.y) / 3, (a.z + b.z + c.z) / 3);
    let depth = 0;
    for (const [other, others] of triangles.entries()) {
      if (other !== index && others.filter((triangle) => isRayCrossing(origin, triangle)).length % 2 === 1) {
        ++depth;
      }
    }
    return depth;
  });
}

/**
 * Splits edges into groups that touch at their vertices.
 * @param {modlumi.Edge[]} edges
 */
function groupConnectedEdges(edges) {
  const remaining = new Map(edges.map((edge) => [edge.entityId, edge]));
  /** @type {modlumi.Edge[][]} */
  const groups = [];
  for (const seed of edges) {
    if (!remaining.delete(seed.entityId)) {
      continue;
    }
    const group = [seed];
    const stack = [seed];
    while (stack.length > 0) {
      const edge = /** @type {modlumi.Edge} */ (stack.pop());
      for (const vertex of [edge.start, edge.end]) {
        for (const next of vertex.edges) {
          if (remaining.delete(next.entityId)) {
            group.push(next);
            stack.push(next);
          }
        }
      }
    }
    groups.push(group);
  }
  return groups;
}

/**
 * Returns the ids of the faces that close volumes of their own: what is left after peeling
 * away, again and again, every face with an edge that fewer than two remaining faces bound.
 * Flaps and partitions peel away, while a box with a flap keeps its six faces.
 * @param {Mesh} mesh
 * @param {modlumi.Face[]} faces
 */
function findClosedVolumes(mesh, faces) {
  const remaining = new Set(faces.map((face) => face.entityId));
  let peeled = true;
  while (peeled) {
    peeled = false;
    for (const face of faces) {
      if (!remaining.has(face.entityId)) {
        continue;
      }
      const open = (mesh.faceEdges.get(face.entityId) ?? []).some((edge) =>
        mesh.getEdgeFaces(edge).filter((other) => remaining.has(other.entityId)).length < 2);
      if (open) {
        remaining.delete(face.entityId);
        peeled = true;
      }
    }
  }
  return remaining;
}

/**
 * Finds what keeps the entities from forming a solid.
 * @param {modlumi.Entities} entities
 * @param {number} shortEdge Edges shorter than this are reported; 0 reports none.
 * @returns {{ kind: ErrorKind, entities: modlumi.DrawingElement[] }[]}
 */
function findErrors(entities, shortEdge) {
  /** @type {{ kind: ErrorKind, entities: modlumi.DrawingElement[] }[]} */
  const errors = [];
  const faces = /** @type {modlumi.Face[]} */ (entities.ofType("Face"));
  const edges = /** @type {modlumi.Edge[]} */ (entities.ofType("Edge"));
  for (const face of faces) {
    if (face.hidden) {
      errors.push({ kind: "hiddenFace", entities: [face] });
    }
  }
  const mesh = new Mesh(faces, edges);
  /** @type {modlumi.Edge[]} */
  const borderEdges = [];
  /** @type {modlumi.Edge[]} */
  const holeEdges = [];
  /** @type {modlumi.Edge[]} */
  const internalEdges = [];
  for (const edge of edges) {
    const edgeFaces = mesh.getEdgeFaces(edge);
    if (edgeFaces.length === 0) {
      errors.push({ kind: "strayEdge", entities: [edge] });
    } else if (edgeFaces.length === 1) {
      const outer = edgeFaces[0].outerLoop.edges.some((other) => other.entityId === edge.entityId);
      (outer ? borderEdges : holeEdges).push(edge);
    } else if (edgeFaces.length > 2) {
      internalEdges.push(edge);
    }
  }
  const shell = new Shell(mesh);
  shell.resolve();
  if (shell.isValid()) {
    // Faces off the shell that close a volume of their own, such as a second box sharing an
    // edge with the first, are another solid rather than faces to erase.
    const volumes = findClosedVolumes(mesh, faces.filter((face) =>
      shell.internalFaces.has(face.entityId) || shell.externalFaces.has(face.entityId)));
    for (const face of faces) {
      const kind = volumes.has(face.entityId) ? null
        : shell.internalFaces.has(face.entityId) ? "internalFace"
        : shell.externalFaces.has(face.entityId) ? "externalFace"
        : shell.reversedFaces.has(face.entityId) ? "reversedFace" : null;
      if (kind !== null) {
        errors.push({ kind, entities: [face] });
      }
    }
    // Fixing erases the other faces; more than two that stay at an edge keep it non-manifold.
    for (const edge of internalEdges) {
      const staying = mesh.getEdgeFaces(edge).filter((face) =>
        shell.shellFaces.has(face.entityId) || volumes.has(face.entityId));
      if (staying.length > 2) {
        errors.push({ kind: "sharedEdge", entities: [edge] });
      }
    }
  } else {
    for (const group of groupConnectedEdges(borderEdges)) {
      errors.push({ kind: "surfaceBorder", entities: group });
    }
    for (const group of groupConnectedEdges(holeEdges)) {
      errors.push({ kind: "faceHole", entities: group });
    }
    for (const edge of internalEdges) {
      errors.push({ kind: "internalFaceEdge", entities: [edge] });
    }
  }
  for (const instance of [...entities.ofType("Group"), ...entities.ofType("ComponentInstance")]) {
    errors.push({ kind: "nestedInstance", entities: [instance] });
  }
  if (shortEdge > 0) {
    for (const edge of edges) {
      if (edge.length < shortEdge) {
        errors.push({ kind: "shortEdge", entities: [edge] });
      }
    }
  }
  return errors;
}

/**
 * Adds what draws an error, in the coordinates of the context being edited.
 * @param {{ kind: ErrorKind, entities: modlumi.DrawingElement[] }} error
 * @param {modlumi.Transformation} transformation
 * @returns {SolidError}
 */
function prepareError(error, transformation) {
  /** @type {modlumi.Point3d[][]} */
  const triangles = [];
  /** @type {modlumi.Point3d[]} */
  const lines = [];
  for (const entity of error.entities) {
    if (entity.type === "Edge") {
      const edge = /** @type {modlumi.Edge} */ (entity);
      lines.push(edge.start.position.transform(transformation), edge.end.position.transform(transformation));
    } else if (entity.type === "Face") {
      const face = /** @type {modlumi.Face} */ (entity);
      try {
        for (const triangle of face.triangles) {
          triangles.push(triangle.map((corner) => corner.transform(transformation)));
        }
      } catch {
        // A degenerate face has no triangles; its edges still show it.
      }
      if (error.kind !== "internalFace" && error.kind !== "externalFace") {
        for (const edge of face.loops.flatMap((loop) => loop.edges)) {
          lines.push(edge.start.position.transform(transformation), edge.end.position.transform(transformation));
        }
      }
    } else {
      const bounds = entity.bounds;
      if (bounds !== null) {
        // The instance's bounding box.
        const { min, max } = bounds;
        /** @param {number} corner */
        const at = (corner) => new modlumi.Point3d(corner & 1 ? max.x : min.x, corner & 2 ? max.y : min.y,
          corner & 4 ? max.z : min.z).transform(transformation);
        for (const [a, b] of [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5],
          [2, 6], [3, 7]]) {
          lines.push(at(a), at(b));
        }
      }
    }
  }
  return { ...error, triangles, lines };
}

/**
 * Returns the selected group or component instance to inspect, or the context being edited.
 * @returns {Target}
 */
function findTarget() {
  for (const entity of model.selection.toArray()) {
    if (entity.type === "Group") {
      const group = /** @type {modlumi.Group} */ (entity);
      return { entities: group.entities, transformation: group.transformation, name: group.name || "Group" };
    }
    if (entity.type === "ComponentInstance") {
      const instance = /** @type {modlumi.ComponentInstance} */ (entity);
      return {
        entities: instance.definition.entities,
        transformation: instance.transformation,
        name: instance.name || instance.definition.name,
      };
    }
  }
  return { entities: model.activeEntities, transformation: new modlumi.Transformation(), name: "the context being edited" };
}

/**
 * Fixes the errors that can be fixed in one undo step, and returns how many couldn't be.
 * @param {SolidError[]} errors
 * @param {modlumi.Entities} entities
 */
function fixErrors(errors, entities) {
  /** @type {Map<number, modlumi.Face>} */
  const eraseFaces = new Map();
  /** @type {Map<number, modlumi.Edge>} */
  const eraseEdges = new Map();
  let unfixed = 0;
  for (const error of errors) {
    if (kErrorKinds[error.kind].fix === null) {
      ++unfixed;
    } else if (kErrorKinds[error.kind].fix === "erase") {
      for (const entity of error.entities) {
        if (entity.type === "Face") {
          eraseFaces.set(entity.entityId, /** @type {modlumi.Face} */ (entity));
        } else if (entity.type === "Edge") {
          eraseEdges.set(entity.entityId, /** @type {modlumi.Edge} */ (entity));
        }
      }
    }
  }
  // Edges between erased faces would be left stray.
  for (const face of eraseFaces.values()) {
    for (const edge of face.loops.flatMap((loop) => loop.edges)) {
      if (edge.faces.every((other) => eraseFaces.has(other.entityId))) {
        eraseEdges.set(edge.entityId, edge);
      }
    }
  }
  // Erasing an edge of a curve erases the whole curve, so keep curves that would lose more.
  const edges = [...eraseEdges.values()].filter((edge) =>
    edge.curve === null || edge.curve.edges.every((other) => eraseEdges.has(other.entityId)));
  unfixed += eraseEdges.size - edges.length > 0 ? 1 : 0;
  model.operation("Repair Solid", () => {
    for (const face of eraseFaces.values()) {
      if (face.isValid) {
        entities.erase(face);
      }
    }
    const valid = edges.filter((edge) => edge.isValid);
    if (valid.length > 0) {
      entities.eraseEdges(valid);
    }
    for (const error of errors) {
      const fix = kErrorKinds[error.kind].fix;
      for (const entity of error.entities) {
        if (!entity.isValid) {
          continue;
        }
        if (fix === "reverse") {
          /** @type {modlumi.Face} */ (entity).reverse();
        } else if (fix === "show") {
          entity.hidden = false;
        }
      }
    }
  });
  return unfixed;
}

/** @param {modlumi.PluginContext} context */
export function activate(context) {
  let active = false;
  /** @type {Target | null} */
  let target = null;
  /** @type {SolidError[]} */
  let errors = [];
  /** @type {ErrorKind | null} The kind of error shown, or null for every kind. */
  let shownKind = null;
  /** @type {number | null} The error cycled to with the arrow keys, in the shown errors. */
  let current = null;
  /** Edges shorter than this many meters are reported; 0 reports none. */
  let shortEdge = 0;
  /** Whether cycling to an error glides the camera to it. */
  let zoomToErrors = Boolean(context.settings.get("zoomToErrors", true));

  function getShownErrors() {
    return shownKind === null ? errors : errors.filter((error) => error.kind === shownKind);
  }

  function showStatus() {
    const shown = getShownErrors();
    tool.status = current === null || current >= shown.length
      ? "Click a group or component to inspect it. The arrow keys cycle through the errors."
      : `Error ${current + 1} of ${shown.length}: ${kErrorKinds[shown[current].kind].name}. The arrow keys ` +
        "cycle through the errors.";
  }

  /**
   * Glides the camera to frame an error, looking in the same direction as before.
   * @param {SolidError} error
   */
  function zoomTo(error) {
    // The error's points are in the coordinates of the context being edited.
    const toWorld = model.activeTransformation;
    const points = [...error.triangles.flat(), ...error.lines].map((point) => point.transform(toWorld));
    if (points.length === 0) {
      return;
    }
    const low = points.reduce((a, b) => new modlumi.Point3d(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.min(a.z, b.z)));
    const high = points.reduce((a, b) => new modlumi.Point3d(Math.max(a.x, b.x), Math.max(a.y, b.y), Math.max(a.z, b.z)));
    const box = new modlumi.BoundingBox(low, high);
    const camera = context.viewport.camera;
    const direction = camera.eye.vectorTo(camera.target).normalize();
    // Far enough that the error fills about a third of the view across its narrower side, but
    // never inside it. The field of view is vertical; a narrow view sees less sideways.
    const radius = Math.max(box.diagonal / 2, 0.05);
    const aspect = context.viewport.width / Math.max(1, context.viewport.height);
    const reach = Math.tan((camera.fieldOfView * Math.PI) / 360) * Math.min(1, aspect || 1);
    const distance = (1.5 * radius) / reach + radius;
    const framed = new modlumi.Camera(box.center.offset(direction.scale(-distance)), box.center,
      { up: camera.up, perspective: camera.perspective, fieldOfView: camera.fieldOfView });
    context.viewport.setCamera(framed, { duration: 0.4 });
  }

  // Inspects the selected group or component, or the context being edited.
  function analyze() {
    target = findTarget();
    const { transformation } = target;
    errors = findErrors(target.entities, shortEdge)
      .sort((a, b) => kKindOrder.indexOf(a.kind) - kKindOrder.indexOf(b.kind))
      .map((error) => prepareError(error, transformation));
    if (shownKind !== null && !errors.some((error) => error.kind === shownKind)) {
      shownKind = null;
    }
    current = null;
    showStatus();
  }

  /** @param {SolidError[]} fixing */
  function fix(fixing) {
    if (target === null) {
      return;
    }
    const unfixed = fixErrors(fixing, target.entities);
    analyze();
    if (unfixed > 0) {
      context.showMessage("Some errors can't be fixed automatically and remain.");
    } else {
      const solid = errors.length === 0 && target.entities.ofType("Face").length > 0;
      context.showMessage(solid ? "All errors fixed: it's a solid." : "Errors fixed.");
    }
  }

  const tool = context.registerTool({
    id: "inspect",
    title: "Solid Inspector",
    tip: "Finds and fixes what keeps a group or component from being a solid.",
    snap: false,
    activate() {
      active = true;
      shownKind = null;
      analyze();
    },
    deactivate() {
      active = false;
      target = null;
      errors = [];
    },
    onMouseUp(event) {
      // Clicking a group or component inspects it; clicking anything else, the context.
      model.selection.clear();
      // What Select would pick: the container in the context being edited.
      const picked = event.picked?.path[model.activePath.length];
      if (picked !== undefined) {
        model.selection.add(picked);
      }
      shownKind = null;
      analyze();
    },
    onKeyDown(event) {
      const shown = getShownErrors();
      if (shown.length === 0) {
        return;
      }
      const step = event.key === "up" || event.key === "right" ? 1 : event.key === "down" || event.key === "left" ? -1 : 0;
      if (step !== 0) {
        current = current === null ? 0 : (current + step + shown.length) % shown.length;
        showStatus();
        if (zoomToErrors) {
          zoomTo(shown[current]);
        }
      }
    },
    onCancel() {
      current = null;
      showStatus();
    },
    options(ui) {
      if (target === null) {
        return;
      }
      ui.text(`Inspecting ${target.name}`, { tone: "muted" });
      if (errors.length === 0) {
        const solid = target.entities.ofType("Face").length > 0;
        ui.text(solid ? "No errors: it's a solid." : "Nothing to inspect.", { tone: solid ? "success" : "normal" });
      } else {
        const rows = kKindOrder
          .map((kind) => ({ kind, count: errors.filter((error) => error.kind === kind).length }))
          .filter(({ count }) => count > 0)
          .map(({ kind, count }) => ({ id: kind, cells: [kErrorKinds[kind].name, count] }));
        const chosen = /** @type {ErrorKind | null} */ (ui.table("Errors", ["Error", { title: "Count", numeric: true }],
          rows, shownKind, { visibleRows: Math.min(rows.length, 6) }));
        if (chosen !== shownKind) {
          shownKind = chosen;
          current = null;
          showStatus();
        }
        if (shownKind !== null) {
          const kind = kErrorKinds[shownKind];
          ui.text(kind.description, { tone: "muted" });
          if (kind.fix !== null && ui.button(`Fix ${kind.name}`)) {
            fix(getShownErrors());
          }
        }
        if (errors.some((error) => kErrorKinds[error.kind].fix !== null) && ui.button("Fix All", { primary: true })) {
          fix(errors);
        }
      }
      ui.separator();
      const zoom = ui.checkbox("Zoom to errors", zoomToErrors, { tip: "The arrow keys glide the camera to each error" });
      if (zoom !== zoomToErrors) {
        zoomToErrors = zoom;
        context.settings.set("zoomToErrors", zoom);
      }
      const findShort = ui.checkbox("Find short edges", shortEdge > 0);
      if (findShort !== shortEdge > 0) {
        shortEdge = findShort ? 0.001 : 0;
        analyze();
      }
      if (shortEdge > 0) {
        const threshold = ui.length("Shorter than", shortEdge, { min: 0.000001 });
        if (threshold !== shortEdge) {
          shortEdge = threshold;
          analyze();
        }
      }
    },
    draw(view) {
      if (target === null) {
        return;
      }
      const shown = getShownErrors();
      const lines = [];
      for (const [index, error] of shown.entries()) {
        if (index === current) {
          continue;
        }
        for (const triangle of error.triangles) {
          view.polygon(triangle, { color: kFaceColor });
        }
        lines.push(...error.lines);
      }
      if (lines.length > 0) {
        view.lines(lines, { color: kEdgeColor, width: 2 });
      }
      const highlighted = current === null ? undefined : shown[current];
      if (highlighted !== undefined) {
        for (const triangle of highlighted.triangles) {
          view.polygon(triangle, { color: kCurrentFaceColor });
        }
        if (highlighted.lines.length > 0) {
          view.lines(highlighted.lines, { color: kCurrentEdgeColor, width: 3 });
        }
      }
    },
  });

  // Undo, redo and edits elsewhere change what the inspected geometry gets wrong, and entering
  // or leaving a group, selecting another or opening a document changes what is inspected.
  const reanalyze = () => {
    if (active) {
      analyze();
    }
  };
  context.onModelChanged(reanalyze);
  context.onActiveContextChanged(reanalyze);
  context.onSelectionChanged(reanalyze);
  context.onDocumentOpened(reanalyze);
}
