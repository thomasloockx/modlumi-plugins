// Bends a group or component along its red axis, as if around a cylinder: drag to set the
// amount, or type an angle in degrees, a bend distance, or a number of segments such as 24s.
// The bend follows a true curve, or one segment per slice; a preview shows the result before
// it is applied in one undo step.
//
// A port of True Bend (https://github.com/thomthom/true-bend):
//
// Copyright (c) 2016 Thomas Thomassen
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
 * @typedef {modlumi.Group | modlumi.ComponentInstance} Container
 * @typedef {{
 *   instance: Container,
 *   middle: modlumi.Point3d,
 *   xAxis: modlumi.Vector3d,
 *   normal: modlumi.Vector3d,
 *   zAxis: modlumi.Vector3d,
 *   length: number,
 *   handle: modlumi.Point3d,
 *   size: number,
 *   edges: modlumi.Point3d[],
 * }} Setup
 *   What a bend works from, in the coordinates of the context being edited: the reference line
 *   through `middle` along the instance's red axis, `length` long; the `normal` a positive bend
 *   curls toward; the handle on the instance's front; and the instance's edges, two points each.
 */

const model = modlumi.activeModel;
const { Point3d, Vector3d } = modlumi;
const kTau = Math.PI * 2;
/** @type {modlumi.Color} */
const kReferenceColor = { r: 0, g: 0.6, b: 0, a: 1 };
/** @type {modlumi.Color} */
const kHandleColor = { r: 0.9, g: 0, b: 0, a: 1 };
/** @type {modlumi.Color} */
const kPreviewColor = { r: 0.5, g: 0, b: 0, a: 1 };

/** @param {Container} container */
function getContents(container) {
  return container.type === "Group"
    ? /** @type {modlumi.Group} */ (container).entities
    : /** @type {modlumi.ComponentInstance} */ (container).definition.entities;
}

/** @param {modlumi.Entities} entities */
function getContainers(entities) {
  return /** @type {Container[]} */ ([...entities.ofType("Group"), ...entities.ofType("ComponentInstance")]);
}

/**
 * Adds the edges of a container's contents, and of the containers inside it, to points as pairs.
 * @param {Container} container
 * @param {modlumi.Transformation} transformation
 * @param {modlumi.Point3d[]} points
 */
function collectEdges(container, transformation, points) {
  const entities = getContents(container);
  for (const edge of /** @type {modlumi.Edge[]} */ (entities.ofType("Edge"))) {
    if (!edge.hidden) {
      points.push(edge.start.position.transform(transformation), edge.end.position.transform(transformation));
    }
  }
  for (const child of getContainers(entities)) {
    collectEdges(child, transformation.multiply(child.transformation), points);
  }
}

/**
 * Prepares to bend a container, or returns null when it can't be bent.
 * @param {Container} instance
 * @returns {Setup | null}
 */
function prepare(instance) {
  const bounds = getContents(instance).bounds;
  const transformation = instance.transformation;
  if (bounds === null) {
    return null;
  }
  const { min, max } = bounds;
  /** @param {number} value @param {number} low @param {number} high */
  const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
  // The reference line runs along the red axis through the origin, or the nearest point of
  // the bounds when the origin lies outside them.
  const y = clamp(0, min.y, max.y);
  const z = clamp(0, min.z, max.z);
  const start = new Point3d(min.x, y, z).transform(transformation);
  const end = new Point3d(max.x, y, z).transform(transformation);
  const length = start.distance(end);
  if (length <= 1e-9) {
    return null;
  }
  const xAxis = start.vectorTo(end).normalize();
  // The front of the instance faces down its green axis.
  const front = new Vector3d(0, -1, 0).transform(transformation);
  const across = front.subtract(xAxis.scale(front.dot(xAxis)));
  if (across.length <= 1e-9) {
    return null;
  }
  const normal = across.normalize();
  const corners = [0, 1, 2, 3, 4, 5, 6, 7].map((corner) => new Point3d(corner & 1 ? max.x : min.x,
    corner & 2 ? max.y : min.y, corner & 4 ? max.z : min.z).transform(transformation));
  /** @type {modlumi.Point3d[]} */
  const edges = [];
  collectEdges(instance, transformation, edges);
  return {
    instance,
    middle: start.offset(xAxis.scale(length / 2)),
    xAxis,
    normal,
    zAxis: xAxis.cross(normal),
    length,
    handle: new Point3d((min.x + max.x) / 2, min.y, (min.z + max.z) / 2).transform(transformation),
    size: corners[0].distance(corners[7]),
    edges,
  };
}

/** @param {modlumi.PluginContext} context */
export function activate(context) {
  /** @type {Setup | null} */
  let setup = null;
  /** The handle's offset along the normal, in meters; positive curls toward the front. */
  let amount = 0;
  /** @type {{ start: modlumi.Point3d, base: number } | null} Where a drag started. */
  let dragging = null;
  /** Whether the next release is the end of a double-click that applied the bend. */
  let releaseApplied = false;
  let subdivisions = Number(context.settings.get("subdivisions", 24));
  let segmented = Boolean(context.settings.get("segmented", true));
  let softSmooth = Boolean(context.settings.get("softSmooth", true));

  // The largest bend, a full circle, moves the handle by the circle's diameter.
  function getMaxAmount() {
    return setup === null ? 0 : (2 * setup.length) / kTau;
  }

  function getAngle() {
    const max = getMaxAmount();
    return max <= 0 ? 0 : (kTau * Math.min(Math.abs(amount), max)) / max;
  }

  function isBending() {
    return getAngle() > 1e-9;
  }

  /**
   * Where a point goes when the reference line bends by angle around a circle that keeps its
   * length, as one chord per subdivision when segmented.
   * @param {modlumi.Point3d} point
   */
  function bendPoint(point) {
    const { middle, xAxis, normal, zAxis, length } = /** @type {Setup} */ (setup);
    const angle = getAngle();
    const side = amount > 0 ? 1 : -1;
    const radius = length / angle;
    const offset = middle.vectorTo(point);
    const along = offset.dot(xAxis) / radius;
    let distance = radius - side * offset.dot(normal);
    if (segmented) {
      const step = angle / subdivisions;
      const index = Math.min(subdivisions - 1, Math.max(0, Math.floor((along + angle / 2) / step)));
      const chordMiddle = -angle / 2 + (index + 0.5) * step;
      distance = (distance * Math.cos(step / 2)) / Math.cos(along - chordMiddle);
    }
    const center = middle.offset(normal.scale(side * radius));
    return center.offset(normal.scale(-side * distance * Math.cos(along))
      .add(xAxis.scale(distance * Math.sin(along)))
      .add(zAxis.scale(offset.dot(zAxis))));
  }

  // Offsets of the slicing planes along the reference line, from its middle.
  function getPlaneOffsets() {
    const { length } = /** @type {Setup} */ (setup);
    return Array.from({ length: subdivisions - 1 }, (_, index) => -length / 2 + ((index + 1) * length) / subdivisions);
  }

  /**
   * Splits the pairs of points at the slicing planes, so straight edges show the curve.
   * @param {modlumi.Point3d[]} pairs
   */
  function slice(pairs) {
    const { middle, xAxis } = /** @type {Setup} */ (setup);
    const planes = getPlaneOffsets();
    /** @type {modlumi.Point3d[]} */
    const result = [];
    for (let index = 0; index + 1 < pairs.length; index += 2) {
      const a = pairs[index];
      const b = pairs[index + 1];
      const ua = middle.vectorTo(a).dot(xAxis);
      const ub = middle.vectorTo(b).dot(xAxis);
      const crossings = planes.filter((u) => (u - ua) * (u - ub) < 0)
        .map((u) => (u - ua) / (ub - ua))
        .sort((s, t) => s - t);
      let previous = a;
      for (const t of crossings) {
        const point = a.offset(a.vectorTo(b).scale(t));
        result.push(previous, point);
        previous = point;
      }
      result.push(previous, b);
    }
    return result;
  }

  function showState() {
    tool.status = setup === null
      ? "Click a group or component to bend it."
      : dragging !== null
        ? "Move to adjust the bend, then click. Type an angle, a distance, or segments like 24s."
        : "Click and move to bend, or type an angle. Press Enter or double-click to apply.";
    tool.measurement = {
      label: "Angle",
      value: setup === null ? "" : `${((getAngle() * 180) / Math.PI).toFixed(1)}°`,
    };
    tool.reference = dragging === null || setup === null ? null : setup.handle.offset(setup.normal.scale(amount));
  }

  /** @param {Container | null} instance */
  function choose(instance) {
    setup = instance === null ? null : prepare(instance);
    amount = 0;
    dragging = null;
    showState();
  }

  function chooseFromSelection() {
    const selected = model.selection.toArray().find((entity) => entity.type === "Group" ||
      entity.type === "ComponentInstance");
    choose(/** @type {Container | undefined} */ (selected) ?? null);
  }

  // Bends the instance in one undo step: slices it at the planes, then moves every vertex.
  function commit() {
    if (setup === null || !isBending()) {
      return;
    }
    const { instance, middle, xAxis, normal, zAxis, size } = setup;
    const planes = getPlaneOffsets();
    try {
      model.operation("Bend", () => {
        instance.makeUnique();
        /** @type {{ entities: modlumi.Entities, transformation: modlumi.Transformation }[]} */
        const contexts = [];
        /** @param {Container} container @param {modlumi.Transformation} transformation */
        const collect = (container, transformation) => {
          const entities = getContents(container);
          contexts.push({ entities, transformation });
          for (const child of getContainers(entities)) {
            child.makeUnique();
            collect(child, transformation.multiply(child.transformation));
          }
        };
        collect(instance, instance.transformation);

        // Large squares across the instance, in a group beside it so they don't cut themselves.
        const cutter = model.activeEntities.addGroup();
        const squares = planes.map((u) => {
          const center = middle.offset(xAxis.scale(u));
          const a = normal.scale(size);
          const b = zAxis.scale(size);
          return cutter.entities.addFace([center.offset(a.add(b)), center.offset(a.subtract(b)),
            center.offset(a.negate().subtract(b)), center.offset(a.negate().add(b))]);
        });
        for (const { entities, transformation } of contexts) {
          const toLocal = transformation.inverse();
          const before = new Set(entities.ofType("Face").map((face) => face.entityId));
          const cut = entities.intersectFaces(entities.ofType("Face"),
            squares.map((face) => ({ face, transformation: toLocal })));
          const cutIds = new Set(cut.map((edge) => edge.entityId));
          // Cut edges that close a loop across the inside fill it; such faces aren't wanted.
          for (const face of /** @type {modlumi.Face[]} */ (entities.ofType("Face"))) {
            if (!before.has(face.entityId) &&
              face.loops.every((loop) => loop.edges.every((edge) => cutIds.has(edge.entityId)))) {
              entities.erase(face);
            }
          }
          if (!segmented || softSmooth) {
            for (const edge of cut) {
              if (edge.isValid) {
                edge.soft = true;
                edge.smooth = true;
              }
            }
          }
          // Loose edges cross no face, so they are split at the planes by hand, last crossing
          // first so the remaining part keeps starting where the edge did.
          for (const edge of /** @type {modlumi.Edge[]} */ (entities.ofType("Edge"))) {
            if (edge.faces.length > 0) {
              continue;
            }
            const ua = middle.vectorTo(edge.start.position.transform(transformation)).dot(xAxis);
            const ub = middle.vectorTo(edge.end.position.transform(transformation)).dot(xAxis);
            const crossings = planes.filter((u) => (u - ua) * (u - ub) < 0)
              .map((u) => (u - ua) / (ub - ua))
              .sort((s, t) => t - s);
            let rest = edge;
            let length = 1;
            for (const t of crossings) {
              // The remaining part runs from the edge's start to the previous crossing.
              rest = entities.splitEdge(rest, t / length)[0];
              length = t;
            }
          }
        }
        model.activeEntities.erase(cutter);

        for (const { entities, transformation } of contexts) {
          const toLocal = transformation.inverse();
          /** @type {Map<number, modlumi.Vertex>} */
          const vertices = new Map();
          for (const edge of /** @type {modlumi.Edge[]} */ (entities.ofType("Edge"))) {
            vertices.set(edge.start.entityId, edge.start);
            vertices.set(edge.end.entityId, edge.end);
          }
          const moving = [...vertices.values()];
          const offsets = moving.map((vertex) =>
            vertex.position.vectorTo(bendPoint(vertex.position.transform(transformation)).transform(toLocal)));
          if (moving.length > 0) {
            entities.moveVertices(moving, offsets);
          }
        }
      });
    } catch (error) {
      context.showMessage(`Can't bend it: ${error instanceof Error ? error.message : error}`);
      return;
    }
    choose(instance.isValid ? instance : null);
  }

  /** @param {string} text */
  function applyValue(text) {
    const trimmed = text.trim();
    const segments = /^(\d+)\s*s$/i.exec(trimmed);
    if (segments !== null) {
      subdivisions = Math.min(360, Math.max(2, Number(segments[1])));
      context.settings.set("subdivisions", subdivisions);
      return true;
    }
    if (setup === null) {
      return false;
    }
    const side = amount < 0 ? -1 : 1;
    const degrees = /^(-?[\d.,]+)\s*(deg|°)?$/i.exec(trimmed);
    if (degrees !== null) {
      const angle = (Number(degrees[1].replace(",", ".")) * Math.PI) / 180;
      if (!Number.isFinite(angle) || angle <= 0 || angle > kTau) {
        return false;
      }
      amount = (side * getMaxAmount() * angle) / kTau;
      return true;
    }
    const distance = model.parseLength(trimmed);
    if (distance === null || distance <= 0) {
      return false;
    }
    amount = side * Math.min(distance, getMaxAmount());
    return true;
  }

  const tool = context.registerTool({
    id: "bend",
    title: "True Bend",
    tip: "Bends a group or component to an angle, along a true or segmented curve.",
    activate: chooseFromSelection,
    deactivate() {
      setup = null;
      dragging = null;
      releaseApplied = false;
    },
    onMouseMove(event) {
      if (setup !== null && dragging !== null && event.point !== null) {
        const moved = dragging.start.vectorTo(event.point.position).dot(setup.normal);
        amount = Math.max(-getMaxAmount(), Math.min(getMaxAmount(), dragging.base + moved));
        showState();
      }
    },
    onMouseUp(event) {
      if (releaseApplied) {
        releaseApplied = false;
        return;
      }
      if (dragging !== null) {
        dragging = null;
        showState();
        return;
      }
      // Before bending, a click chooses what to bend.
      const picked = event.picked?.path[model.activePath.length] ?? null;
      if (setup === null || (amount === 0 && picked !== null && picked.entityId !== setup.instance.entityId)) {
        model.selection.clear();
        if (picked !== null) {
          model.selection.add(picked);
        }
        choose(picked);
        return;
      }
      if (event.point !== null) {
        dragging = { start: event.point.position, base: amount };
        showState();
      }
    },
    onDoubleClick() {
      // The double-click's own release follows; it ends the gesture rather than starting another.
      releaseApplied = true;
      commit();
    },
    onKeyDown(event) {
      if (event.key === "enter") {
        commit();
      }
    },
    onValue(text) {
      if (!applyValue(text)) {
        context.showMessage(`Can't bend by "${text}"`);
      }
      showState();
    },
    onCancel(reason) {
      if (dragging !== null) {
        amount = dragging.base;
        dragging = null;
      } else if (reason === "escape") {
        amount = 0;
      }
      showState();
    },
    options(ui) {
      if (setup === null) {
        ui.text("Click a group or component to bend it.", { tone: "muted" });
        return;
      }
      const chosen = ui.integer("Segments", subdivisions, { min: 2, max: 360 });
      if (chosen !== subdivisions) {
        subdivisions = chosen;
        context.settings.set("subdivisions", subdivisions);
      }
      const chord = ui.checkbox("Segmented", segmented, { tip: "Bend along one straight segment per slice." });
      if (chord !== segmented) {
        segmented = chord;
        context.settings.set("segmented", segmented);
      }
      const soften = ui.checkbox("Soften segment edges", segmented ? softSmooth : true, { disabled: !segmented });
      if (segmented && soften !== softSmooth) {
        softSmooth = soften;
        context.settings.set("softSmooth", softSmooth);
      }
      const angle = getAngle();
      ui.readOnly("Angle", `${((angle * 180) / Math.PI).toFixed(1)}°`);
      ui.readOnly("Radius", isBending() ? model.formatLength(setup.length / angle) : "Straight");
      ui.row(() => {
        if (ui.button("Reset", { disabled: !isBending() })) {
          amount = 0;
          dragging = null;
          showState();
        }
        if (ui.button("Bend", { primary: true, disabled: !isBending() })) {
          commit();
        }
      });
    },
    draw(view) {
      if (setup === null) {
        return;
      }
      showState();
      const { middle, xAxis, normal, length, handle, size } = setup;
      const reference = Array.from({ length: subdivisions + 1 }, (_, index) =>
        middle.offset(xAxis.scale(-length / 2 + (index * length) / subdivisions)));
      const tip = handle.offset(normal.scale(amount));
      view.lines([handle.offset(normal.scale(-size / 2)), handle.offset(normal.scale(size / 2))],
        { color: kHandleColor, stipple: "dashed" });
      view.lines([handle, tip], { color: kHandleColor, width: 2 });
      view.points([tip], { color: kHandleColor, width: 10 });
      if (!isBending()) {
        view.polyline(reference, { color: kReferenceColor, width: 2 });
        view.points(reference, { color: kReferenceColor, width: 5 });
        return;
      }
      const bent = reference.map(bendPoint);
      view.polyline(bent, { color: kReferenceColor, width: 2 });
      view.points(bent, { color: kReferenceColor, width: 5 });
      view.lines(slice(setup.edges).map(bendPoint), { color: kPreviewColor, width: 1 });
    },
  });

  // Undo, redo and edits elsewhere may change or remove what is being bent.
  const refresh = () => {
    if (setup !== null && dragging === null) {
      choose(setup.instance.isValid ? setup.instance : null);
    }
  };
  context.onModelChanged(refresh);
  // The target and its frame belong to the context being edited, like the selection.
  context.onActiveContextChanged(chooseFromSelection);
  context.onDocumentOpened(() => choose(null));
}
