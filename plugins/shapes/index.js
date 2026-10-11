// Adds parametric shapes from a dialog of their parameters. Each shape is a group that keeps
// its parameters, so selecting it shows them in Properties, where changing one rebuilds it.
//
// A port of the Shapes extension (https://github.com/SketchUp/sketchup-shapes):
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
 * @typedef {Record<string, number>} Parameters
 * @typedef {{
 *   id: string,
 *   title: string,
 *   tip: string,
 *   defaults: Parameters,
 *   schema: Record<string, modlumi.FormField>,
 *   problem?: (parameters: Parameters) => string | undefined,
 *   draw: (entities: modlumi.Entities, parameters: Parameters) => void,
 * }} Shape
 * @typedef {{ shape: string, parameters: Parameters }} ShapeData
 */

const model = modlumi.activeModel;
// The shortest length a dimension may have.
const kMinLength = 0.001;
// Edges between faces that meet at a smaller angle are softened, so curved surfaces read as one.
const kSmoothAngle = (46 * Math.PI) / 180;
// Coordinates closer than this to a plane or axis lie on it.
const kTolerance = 1e-9;

/** @param {string} label @returns {modlumi.FormField} */
const length = (label) => ({ type: "length", label, min: kMinLength });
/** @param {string} label @param {number} min @param {number} max @param {string} [tip] @returns {modlumi.FormField} */
const count = (label, min, max, tip) => ({ type: "integer", label, min, max, tip });

/**
 * `segments` points around a circle of `radius` at height `z`, counterclockwise from `start`
 * radians off the X axis.
 * @param {number} radius
 * @param {number} segments
 * @returns {[number, number, number][]}
 */
function ring(radius, segments, z = 0, start = 0) {
  return Array.from({ length: segments }, (_, index) => {
    const angle = start + (2 * Math.PI * index) / segments;
    return [radius * Math.cos(angle), radius * Math.sin(angle), z];
  });
}

/**
 * Points along a helix that turns `turns` times, counterclockwise when positive, rising
 * `pitch` per turn while its radius changes linearly from `startRadius` to `endRadius`.
 * @param {Parameters} helix
 * @param {number} startRadius
 * @param {number} endRadius
 * @returns {[number, number, number][]}
 */
function helixPoints(helix, startRadius, endRadius) {
  const steps = Math.max(1, Math.round(Math.abs(helix.turns) * helix.segments));
  const turnsPerStep = helix.turns / steps;
  return Array.from({ length: steps + 1 }, (_, step) => {
    const radius = startRadius + ((endRadius - startRadius) * step) / steps;
    const angle = helix.startAngle + 2 * Math.PI * turnsPerStep * step;
    return [radius * Math.cos(angle), radius * Math.sin(angle), helix.pitch * turnsPerStep * step];
  });
}

/**
 * Explains why a helix, or a ramp `width` wide, can't be drawn, or returns `undefined`. Without
 * a pitch, turns overlap unless the radius grows by more than the width each turn.
 * @param {Parameters} helix
 * @param {number} [width]
 */
function helixProblem(helix, width = 0) {
  if (Math.abs(helix.turns) * helix.segments < 1) {
    return "Too few turns to draw one segment.";
  }
  const growth = Math.abs(helix.endRadius - helix.startRadius) / Math.abs(helix.turns);
  if (helix.pitch === 0 && Math.abs(helix.turns) > 1 && growth <= width) {
    return "Without a pitch, the turns would overlap.";
  }
  return undefined;
}

/**
 * Softens and smooths the edges between faces that meet at a shallow angle, so curved
 * surfaces read as one.
 * @param {modlumi.Entities} entities
 */
function smooth(entities) {
  /** @type {Map<modlumi.Edge, modlumi.Vector3d[]>} */
  const normals = new Map();
  for (const face of entities.ofType("Face")) {
    for (const loop of face.loops) {
      for (const edge of loop.edges) {
        const list = normals.get(edge) ?? [];
        if (face.normal) {
          list.push(face.normal);
        }
        normals.set(edge, list);
      }
    }
  }
  for (const [edge, [first, second, ...rest]] of normals) {
    if (first && second && rest.length === 0 && first.angleBetween(second) < kSmoothAngle) {
      edge.soft = true;
      edge.smooth = true;
    }
  }
}

/**
 * The normal of the side `points` run counterclockwise around, by Newell's method.
 * @param {modlumi.Point3dLike[]} points
 */
function windingNormal(points) {
  let normal = new modlumi.Vector3d();
  points.forEach((point, index) => {
    const [x1, y1, z1] = point;
    const [x2, y2, z2] = points[(index + 1) % points.length];
    normal = normal.add([(y1 - y2) * (z1 + z2), (z1 - z2) * (x1 + x2), (x1 - x2) * (y1 + y2)]);
  });
  return normal;
}

/**
 * Draws a face through each polygon, its front on the side the points run counterclockwise
 * around. Closing planar loops also fills them, like drawing them by hand would, so faces other
 * than these and `keep` are erased again.
 * @param {modlumi.Entities} entities
 * @param {modlumi.Point3dLike[][]} polygons
 * @param {modlumi.Face[]} [keep]
 */
function addFaces(entities, polygons, keep = []) {
  const wanted = new Set(keep);
  for (const polygon of polygons) {
    const face = entities.addFace(polygon);
    // Drawing earlier faces may have filled this one already, facing either way.
    if (face.normal && face.normal.dot(windingNormal(polygon)) < 0) {
      face.reverse();
    }
    wanted.add(face);
  }
  for (const face of entities.ofType("Face")) {
    if (!wanted.has(face)) {
      entities.erase(face);
    }
  }
}

/**
 * Revolves a profile in the XZ plane around the Z axis, along a circle of `radius`.
 * @param {modlumi.Entities} entities
 * @param {modlumi.Point3dLike[]} profile
 * @param {number} radius
 * @param {number} segments
 */
function revolve(entities, profile, radius, segments) {
  const path = ring(radius, segments);
  entities.addFace(profile).sweep([...path, path[0]]);
}

/**
 * Revolving a profile edge along the X axis leaves a fan of triangles around the origin; erases
 * its spokes so they merge into one face.
 * @param {modlumi.Entities} entities
 */
function mergeFan(entities) {
  const isHub = (/** @type {modlumi.Vertex} */ vertex) => vertex.position.distance([0, 0, 0]) < kTolerance;
  const spokes = entities.ofType("Edge").filter((edge) =>
    Math.abs(edge.start.position.z) < kTolerance && Math.abs(edge.end.position.z) < kTolerance &&
    (isHub(edge.start) || isHub(edge.end)));
  entities.eraseEdges(spokes);
  const hub = entities.vertices.find(isHub);
  if (hub) {
    entities.erase(hub);
  }
}

/**
 * Draws triangles from each edge of `base`'s outer loop up to `apex`, then turns the base to
 * face down, closing a solid.
 * @param {modlumi.Entities} entities
 * @param {modlumi.Face} base a face in the XY plane whose front faces up
 * @param {modlumi.Point3dLike} apex
 */
function addApex(entities, base, apex) {
  // Taking the corners from the base keeps the triangles on its exact vertices.
  const corners = base.outerLoop.edgeUses.map((use) => use.start.position);
  base.reverse();
  const sides = corners.map((corner, index) => [corner, corners[(index + 1) % corners.length], apex]);
  addFaces(entities, sides, [base]);
}

/** @type {Shape[]} */
const kShapes = [
  {
    id: "box",
    title: "Box",
    tip: "Adds a box from its width, depth and height.",
    defaults: { width: 1, depth: 1, height: 1 },
    schema: { width: length("Width"), depth: length("Depth"), height: length("Height") },
    draw(entities, box) {
      entities.addRectangle([0, 0, 0], box.width, box.depth).extrude(box.height);
    },
  },
  {
    id: "cylinder",
    title: "Cylinder",
    tip: "Adds a cylinder standing on its base circle.",
    defaults: { radius: 0.5, height: 1, segments: 24 },
    schema: { radius: length("Radius"), height: length("Height"), segments: count("Segments", 3, 360) },
    draw(entities, cylinder) {
      entities.addCircle([0, 0, 0], cylinder.radius, { segments: cylinder.segments }).extrude(cylinder.height);
      // Extruding leaves the top's edges without a curve: retrace them as a circle.
      entities.addCircle([0, 0, cylinder.height], cylinder.radius, { segments: cylinder.segments });
      smooth(entities);
    },
  },
  {
    id: "cone",
    title: "Cone",
    tip: "Adds a cone standing on its base circle.",
    defaults: { radius: 0.5, height: 1, segments: 24 },
    schema: { radius: length("Radius"), height: length("Height"), segments: count("Segments", 3, 360) },
    draw(entities, cone) {
      const base = entities.addCircle([0, 0, 0], cone.radius, { segments: cone.segments });
      addApex(entities, base, [0, 0, cone.height]);
      smooth(entities);
    },
  },
  {
    id: "torus",
    title: "Torus",
    tip: "Adds a ring with a round profile, lying flat.",
    defaults: { outerRadius: 1, profileRadius: 0.25, profileSegments: 12, segments: 24 },
    schema: {
      outerRadius: { ...length("Outer radius"), tip: "From the center to the outside of the ring" },
      profileRadius: { ...length("Profile radius"), tip: "Radius of the ring's round cross-section" },
      profileSegments: count("Profile segments", 3, 96),
      segments: count("Ring segments", 3, 96),
    },
    problem: (torus) =>
      torus.profileRadius * 2 >= torus.outerRadius
        ? "The profile radius must be less than half the outer radius."
        : undefined,
    draw(entities, torus) {
      const middle = torus.outerRadius - torus.profileRadius;
      const profile = ring(torus.profileRadius, torus.profileSegments).map(([x, y]) => [middle + x, 0, y]);
      revolve(entities, /** @type {[number, number, number][]} */ (profile), middle, torus.segments);
      smooth(entities);
    },
  },
  {
    id: "tube",
    title: "Tube",
    tip: "Adds a hollow cylinder from its outer radius and wall thickness.",
    defaults: { radius: 0.5, thickness: 0.05, height: 1, segments: 24 },
    schema: {
      radius: { ...length("Outer radius") },
      thickness: length("Wall thickness"),
      height: length("Height"),
      segments: count("Segments", 3, 360),
    },
    problem: (tube) => (tube.thickness >= tube.radius ? "The wall must be thinner than the radius." : undefined),
    draw(entities, tube) {
      entities.addCircle([0, 0, 0], tube.radius, { segments: tube.segments });
      // The inner circle cuts its own face out of the outer one, leaving a ring.
      entities.erase(entities.addCircle([0, 0, 0], tube.radius - tube.thickness, { segments: tube.segments }));
      entities.ofType("Face")[0].extrude(tube.height);
      smooth(entities);
    },
  },
  {
    id: "prism",
    title: "Prism",
    tip: "Adds a prism on a regular polygon.",
    defaults: { radius: 0.5, height: 1, sides: 6 },
    schema: {
      radius: { ...length("Radius"), tip: "From the center to a corner" },
      height: length("Height"),
      sides: count("Sides", 3, 360),
    },
    draw(entities, prism) {
      entities.addPolygon([0, 0, 0], prism.radius, prism.sides).extrude(prism.height);
    },
  },
  {
    id: "pyramid",
    title: "Pyramid",
    tip: "Adds a pyramid on a regular polygon.",
    defaults: { radius: 0.5, height: 1, sides: 4 },
    schema: {
      radius: { ...length("Radius"), tip: "From the center to a corner" },
      height: length("Height"),
      sides: count("Sides", 3, 360),
    },
    draw(entities, pyramid) {
      addApex(entities, entities.addPolygon([0, 0, 0], pyramid.radius, pyramid.sides), [0, 0, pyramid.height]);
    },
  },
  {
    id: "dome",
    title: "Dome",
    tip: "Adds a half sphere standing on its flat side.",
    defaults: { radius: 0.5, segments: 6 },
    schema: { radius: length("Radius"), segments: count("Segments per 90°", 1, 24) },
    draw(entities, dome) {
      /** @type {[number, number, number][]} */
      const profile = [[0, 0, 0]];
      for (let index = 0; index <= dome.segments; ++index) {
        const angle = (Math.PI / 2) * (index / dome.segments);
        profile.push([index === dome.segments ? 0 : dome.radius * Math.cos(angle), 0, dome.radius * Math.sin(angle)]);
      }
      revolve(entities, profile, dome.radius, dome.segments * 4);
      mergeFan(entities);
      smooth(entities);
    },
  },
  {
    id: "sphere",
    title: "Sphere",
    tip: "Adds a sphere around the origin.",
    defaults: { radius: 0.5, segments: 6 },
    schema: { radius: length("Radius"), segments: count("Segments per 90°", 1, 24) },
    draw(entities, sphere) {
      const rings = sphere.segments * 2;
      const profile = Array.from({ length: rings + 1 }, (_, index) => {
        const angle = (Math.PI * index) / rings - Math.PI / 2;
        const onAxis = index === 0 || index === rings;
        return /** @type {[number, number, number]} */ ([onAxis ? 0 : sphere.radius * Math.cos(angle), 0,
          sphere.radius * Math.sin(angle)]);
      });
      revolve(entities, profile, sphere.radius, sphere.segments * 4);
      smooth(entities);
    },
  },
  {
    id: "helix",
    title: "Helix",
    tip: "Adds a helix or spiral line around the Z axis.",
    defaults: { startRadius: 0.5, endRadius: 0.5, pitch: 0.5, turns: 2, segments: 24, startAngle: 0 },
    schema: {
      startRadius: length("Start radius"),
      endRadius: length("End radius"),
      pitch: { type: "length", label: "Pitch", tip: "Rise per turn; negative pitches go down" },
      turns: { type: "number", label: "Turns", decimals: 2, tip: "Negative turns run clockwise" },
      segments: count("Segments per turn", 3, 360),
      startAngle: { type: "angle", label: "Start angle", tip: "Where the helix starts, from the X axis" },
    },
    problem: (helix) => helixProblem(helix),
    draw(entities, helix) {
      entities.addEdges(helixPoints(helix, helix.startRadius, helix.endRadius));
      // A flat helix that closes a full turn would fill it.
      for (const face of entities.ofType("Face")) {
        entities.erase(face);
      }
    },
  },
  {
    id: "helical-ramp",
    title: "Helical Ramp",
    tip: "Adds a spiral ramp surface around the Z axis.",
    defaults: {
      startRadius: 0.5,
      endRadius: 0.5,
      startWidth: 1,
      endWidth: 1,
      pitch: 2,
      turns: 1,
      segments: 24,
      startAngle: 0,
    },
    schema: {
      startRadius: { ...length("Start radius"), tip: "Inner radius where the ramp starts" },
      endRadius: { ...length("End radius"), tip: "Inner radius where the ramp ends" },
      startWidth: length("Start width"),
      endWidth: length("End width"),
      pitch: { type: "length", label: "Pitch", tip: "Rise per turn; negative pitches go down" },
      turns: { type: "number", label: "Turns", decimals: 2, tip: "Negative turns run clockwise" },
      segments: count("Segments per turn", 3, 360),
      startAngle: { type: "angle", label: "Start angle", tip: "Where the ramp starts, from the X axis" },
    },
    problem: (ramp) => helixProblem(ramp, Math.max(ramp.startWidth, ramp.endWidth)),
    draw(entities, ramp) {
      const inner = helixPoints(ramp, ramp.startRadius, ramp.endRadius);
      const outer = helixPoints(ramp, ramp.startRadius + ramp.startWidth, ramp.endRadius + ramp.endWidth);
      /** @type {modlumi.Point3dLike[][]} */
      const triangles = [];
      for (let step = 0; step + 1 < inner.length; ++step) {
        // Ordered so the ramp's front faces up while it turns counterclockwise.
        const first = [inner[step], outer[step], inner[step + 1]];
        const second = [outer[step], outer[step + 1], inner[step + 1]];
        triangles.push(...(ramp.turns > 0 ? [first, second] : [first.reverse(), second.reverse()]));
      }
      addFaces(entities, triangles);
      smooth(entities);
    },
  },
];

const kShapesById = new Map(kShapes.map((shape) => [shape.id, shape]));

/**
 * Draws the shape's parameters and returns them, changed where the user edited them, and why
 * they can't be drawn, if they can't.
 * @param {modlumi.Ui} ui
 * @param {Shape} shape
 * @param {Parameters} parameters
 * @returns {[Parameters, string | undefined]}
 */
function drawParameters(ui, shape, parameters) {
  const changed = ui.form(parameters, shape.schema);
  const problem = shape.problem?.(changed);
  if (problem) {
    ui.text(problem, { tone: "warning" });
  }
  return [changed, problem];
}

/**
 * Replaces everything in entities with the shape.
 * @param {modlumi.Entities} entities
 * @param {Shape} shape
 * @param {Parameters} parameters
 */
function redraw(entities, shape, parameters) {
  for (const element of entities) {
    if (!(element instanceof modlumi.Edge) && !(element instanceof modlumi.Face) && element.isValid) {
      entities.erase(element);
    }
  }
  entities.eraseEdges(entities.ofType("Edge"));
  shape.draw(entities, parameters);
}

/** @param {modlumi.PluginContext} context */
export function activate(context) {
  /**
   * Parameters shown in Properties that can't be drawn yet, by the shape they belong to, with
   * the stored parameters they were edited from. An undo or redo that changes those drops them.
   * @type {Map<modlumi.Group | modlumi.ComponentInstance, { from: string, parameters: Parameters }>}
   */
  const drafts = new Map();

  /**
   * Adds the shape as a new group in the active context and selects it. One undo step.
   * @param {Shape} shape
   * @param {Parameters} parameters
   */
  function create(shape, parameters) {
    const group = model.operation(`Add ${shape.title}`, () => {
      const added = model.activeEntities.addGroup();
      added.name = shape.title;
      shape.draw(added.entities, parameters);
      context.entityData.set(added, /** @type {ShapeData} */ ({ shape: shape.id, parameters }));
      return added;
    });
    model.selection.clear();
    model.selection.add(group);
  }

  /**
   * Rebuilds the shape in group from new parameters. One undo step.
   * @param {modlumi.Group} group
   * @param {Shape} shape
   * @param {Parameters} parameters
   */
  function rebuild(group, shape, parameters) {
    model.operation(`Change ${shape.title}`, () => {
      // Copies of the shape share its entities until one of them changes.
      group.makeUnique();
      redraw(group.entities, shape, parameters);
      context.entityData.set(group, /** @type {ShapeData} */ ({ shape: shape.id, parameters }));
    });
  }

  /** @param {Shape} shape */
  function showDialog(shape) {
    // The dialog starts from the shape's last parameters.
    /** @type {Parameters} */
    let parameters = { ...shape.defaults, ...context.settings.get(shape.id, {}) };
    context.showDialog({
      id: "add",
      title: shape.title,
      draw(ui) {
        const [changed, problem] = drawParameters(ui, shape, parameters);
        parameters = changed;
        ui.spacing();
        ui.row(() => {
          if (ui.button("Add", { primary: true, disabled: problem !== undefined })) {
            ui.close();
            create(shape, parameters);
            try {
              context.settings.set(shape.id, parameters);
            } catch (error) {
              // Only the next dialog's starting values are lost.
              console.warn(`Could not remember the ${shape.title.toLowerCase()} parameters: ${error}`);
            }
          }
          if (ui.button("Cancel")) {
            ui.close();
          }
        });
      },
    });
  }

  for (const shape of kShapes) {
    context.registerCommand({ id: shape.id, title: `${shape.title}...`, tip: shape.tip, run: () => showDialog(shape) });
  }

  context.addPropertiesSection({
    id: "shape",
    title: "Shape",
    draw(ui, container) {
      /** @type {ShapeData | undefined} */
      const data = context.entityData.get(container);
      const shape = kShapesById.get(data?.shape ?? "");
      if (!data || !shape || !(container instanceof modlumi.Group)) {
        return;
      }
      ui.readOnly("Shape", shape.title);
      const stored = JSON.stringify(data.parameters);
      const draft = drafts.get(container);
      const [changed, problem] = drawParameters(ui, shape,
        draft?.from === stored ? draft.parameters : data.parameters);
      if (problem) {
        drafts.set(container, { from: stored, parameters: changed });
        return;
      }
      drafts.delete(container);
      if (JSON.stringify(changed) !== stored) {
        rebuild(container, shape, changed);
      }
    },
  });
}
