// Sweeps a surface between a start and an end profile along two rails. Each rail runs from a
// point on the start profile to a point on the end profile; at every section along the way the
// profile blends from the start shape to the end shape, and the two rail points set where the
// section sits, how it turns and how wide it is. Closed profiles get end caps, so the result
// can be a solid. A preview shows the surface before it is added, as a group, in one undo step.
//
// Profiles are faces, curves or chains of edges, and may have different numbers of points:
// both are resampled at each other's corners, in parts split where the rails touch them, so
// the rails stay on the surface. Pick the start profile twice to sweep a single profile.

/**
 * @typedef {{ face: modlumi.Face } | { edges: modlumi.Edge[] }} Pick
 *   A profile or rail: a face's outer loop, or a chain of edges.
 * @typedef {{ points: modlumi.Point3d[], closed: boolean }} Polyline
 *   Points along a profile or rail, the first not repeated at the end of a closed one.
 * @typedef {{ origin: modlumi.Point3d, xAxis: modlumi.Vector3d, up: modlumi.Vector3d,
 *   along: modlumi.Vector3d, width: number }} Frame
 *   A section's placement: from rail 1's point `origin` toward rail 2's point along `xAxis`,
 *   `width` away, with `along` the rails' direction square to `xAxis`, and `up` the third axis.
 * @typedef {{ sections: modlumi.Point3d[][], closed: boolean }} Sweep
 *   The swept surface: corresponding points of each section, from the start profile to the end.
 */

const model = modlumi.activeModel;
const { Vector3d } = modlumi;
const kEpsilon = 1e-9;
/** Edges between faces that meet at less than this many radians are softened. */
const kSmoothAngle = (30 * Math.PI) / 180;
/** @type {modlumi.Color[]} The colors of the start profile, the end profile and the rails. */
const kPickColors = [
  { r: 0.1, g: 0.35, b: 0.9, a: 1 },
  { r: 0.6, g: 0.1, b: 0.8, a: 1 },
  { r: 0, g: 0.6, b: 0, a: 1 },
  { r: 0, g: 0.6, b: 0, a: 1 },
];
/** @type {modlumi.Color} */
const kHoverColor = { r: 0.95, g: 0.6, b: 0, a: 1 };
/** @type {modlumi.Color} */
const kPreviewColor = { r: 0.5, g: 0, b: 0, a: 1 };
const kSlotNames = ["the start profile", "the end profile", "rail 1", "rail 2"];
const kSlotLabels = ["Start", "End", "Rail 1", "Rail 2"];

/** @param {Pick} pick */
function getEdges(pick) {
  return "face" in pick ? [...pick.face.outerLoop.edges] : pick.edges;
}

/** @param {Pick} pick */
function isValidPick(pick) {
  return "face" in pick ? pick.face.isValid : pick.edges.every((edge) => edge.isValid);
}

/**
 * The chain of edges through an edge: the selected edges around it when it is selected with
 * others, its curve when it has one, or else the edges that continue it one to one at each
 * vertex. Edges in `excluded`, such as those of profiles already picked, end the chain at
 * the vertices they touch, so a rail stops at a profile even where another edge continues it.
 * @param {modlumi.Edge} edge
 * @param {Set<modlumi.Edge>} excluded
 * @returns {modlumi.Edge[]}
 */
function getChain(edge, excluded) {
  const selected = model.selection.has(edge)
    ? new Set(/** @type {modlumi.Edge[]} */ (model.selection.toArray().filter((entity) => entity.type === "Edge")))
    : null;
  /** @type {Set<modlumi.Edge> | null} */
  const allowed = selected !== null && selected.size > 1 ? selected : edge.curve === null ? null : new Set(edge.curve.edges);
  /** @param {modlumi.Vertex} vertex @param {modlumi.Edge} from */
  const next = (vertex, from) => {
    if (vertex.edges.some((other) => excluded.has(other))) {
      return null;
    }
    const others = vertex.edges.filter((other) => other !== from && !excluded.has(other) &&
      (allowed === null ? other.curve === null : allowed.has(other)));
    return others.length === 1 && (allowed !== null || vertex.edges.length === 2) ? others[0] : null;
  };
  const chain = [edge];
  const visited = new Set(chain);
  /** @param {modlumi.Vertex} vertex @param {boolean} forward */
  const extend = (vertex, forward) => {
    for (let from = edge, at = vertex; ;) {
      const other = next(at, from);
      if (other === null || visited.has(other)) {
        return;
      }
      visited.add(other);
      if (forward) {
        chain.push(other);
      } else {
        chain.unshift(other);
      }
      at = other.start === at ? other.end : other.start;
      from = other;
    }
  };
  extend(edge.end, true);
  extend(edge.start, false);
  return chain;
}

/**
 * The points along a pick, in order.
 * @param {Pick} pick
 * @returns {Polyline}
 */
function getPolyline(pick) {
  if ("face" in pick) {
    return { points: pick.face.outerLoop.edgeUses.map((use) => use.start.position), closed: true };
  }
  const { edges } = pick;
  if (edges.length === 1) {
    return { points: [edges[0].start.position, edges[0].end.position], closed: false };
  }
  // The first vertex is the one the first edge doesn't share with the second.
  const second = edges[1];
  let at = edges[0].start === second.start || edges[0].start === second.end ? edges[0].end : edges[0].start;
  const vertices = [at];
  for (const edge of edges) {
    at = edge.start === at ? edge.end : edge.start;
    vertices.push(at);
  }
  const closed = vertices.length > 3 && vertices[0] === vertices[vertices.length - 1];
  if (closed) {
    vertices.pop();
  }
  return { points: vertices.map((vertex) => vertex.position), closed };
}

/**
 * The distances along a polyline to each point, and to the end of a closed one's last segment.
 * @param {Polyline} line
 */
function getStations(line) {
  const { points, closed } = line;
  const stations = [0];
  const count = closed ? points.length : points.length - 1;
  for (let index = 0; index < count; ++index) {
    stations.push(stations[index] + points[index].distance(points[(index + 1) % points.length]));
  }
  return stations;
}

/**
 * The point a distance along a polyline, wrapping around a closed one.
 * @param {Polyline} line
 * @param {number[]} stations
 * @param {number} at
 */
function getPointAt(line, stations, at) {
  const { points, closed } = line;
  const length = stations[stations.length - 1];
  let s = closed && length > 0 ? ((at % length) + length) % length : Math.min(length, Math.max(0, at));
  let index = 0;
  while (index + 2 < stations.length && stations[index + 1] < s) {
    ++index;
  }
  const span = stations[index + 1] - stations[index];
  const t = span > 0 ? (s - stations[index]) / span : 0;
  const a = points[index];
  const b = points[(index + 1) % points.length];
  return a.offset(a.vectorTo(b).scale(t));
}

/**
 * The point of a polyline closest to a point, and how far along the polyline it lies.
 * @param {Polyline} line
 * @param {number[]} stations
 * @param {modlumi.Point3d} point
 */
function getNearest(line, stations, point) {
  const { points } = line;
  let best = { at: 0, distance: points[0].distance(point) };
  for (let index = 0; index + 1 < stations.length; ++index) {
    const a = points[index];
    const segment = a.vectorTo(points[(index + 1) % points.length]);
    const lengthSquared = segment.dot(segment);
    const t = lengthSquared > 0 ? Math.min(1, Math.max(0, a.vectorTo(point).dot(segment) / lengthSquared)) : 0;
    const distance = a.offset(segment.scale(t)).distance(point);
    if (distance < best.distance) {
      best = { at: stations[index] + t * (stations[index + 1] - stations[index]), distance };
    }
  }
  return best;
}

/** @param {Polyline} line */
function reverse(line) {
  const points = [...line.points].reverse();
  return { points, closed: line.closed };
}

/** @param {modlumi.Vector3d} vector */
function getAnyPerpendicular(vector) {
  const other = Math.abs(vector.x) < 0.9 ? new Vector3d(1, 0, 0) : new Vector3d(0, 1, 0);
  return vector.cross(other).normalize();
}

/**
 * A rail's direction at a fraction of its length: its segment's, or the average of the two
 * segments that meet there.
 * @param {Polyline} rail
 * @param {number[]} stations
 * @param {number} t
 */
function getRailDirection(rail, stations, t) {
  const { points } = rail;
  const length = stations[stations.length - 1];
  const s = t * length;
  /** @param {number} index */
  const direction = (index) => points[index].vectorTo(points[index + 1]);
  let index = 0;
  while (index + 2 < stations.length && stations[index + 1] < s - kEpsilon * length) {
    ++index;
  }
  let result = direction(index);
  if (result.length > 0) {
    result = result.normalize();
  }
  /** @param {number} other */
  const average = (other) => {
    const vector = direction(other);
    return vector.length > 0 ? result.add(vector.normalize()) : result;
  };
  if (Math.abs(s - stations[index]) <= kEpsilon * length && index > 0) {
    result = average(index - 1);
  } else if (Math.abs(s - stations[index + 1]) <= kEpsilon * length && index + 2 < stations.length) {
    result = average(index + 1);
  }
  return result;
}

/**
 * The sorted fractions in [0, 1] from several lists, with near repeats removed.
 * @param {number[][]} lists
 */
function mergeFractions(lists) {
  const sorted = lists.flat().sort((a, b) => a - b);
  /** @type {number[]} */
  const merged = [];
  for (const value of sorted) {
    if (merged.length === 0 || value - merged[merged.length - 1] > 1e-7) {
      merged.push(value);
    }
  }
  return merged;
}

/**
 * Sweeps the picked profiles along the picked rails.
 * @param {Pick} startPick
 * @param {Pick} endPick
 * @param {Pick} rail1Pick
 * @param {Pick} rail2Pick
 * @param {{ sections: number, scaleHeight: boolean }} options
 *   `sections`: how many sections to divide the rails into, or 0 for one at each rail point.
 *   `scaleHeight`: whether a section's height scales with its width, or stays as it is.
 * @returns {Sweep}
 */
function sweep(startPick, endPick, rail1Pick, rail2Pick, options) {
  const single = startPick === endPick;
  const profiles = [getPolyline(startPick), getPolyline(endPick)];
  if (profiles[0].closed !== profiles[1].closed) {
    throw new Error("Both profiles must be closed, or both open.");
  }
  const profileStations = profiles.map(getStations);
  const rails = [getPolyline(rail1Pick), getPolyline(rail2Pick)].map((rail) => {
    if (rail.closed) {
      throw new Error("A rail must be open, from one profile to the other.");
    }
    // Each rail starts at the start profile.
    const stations = getStations(rail);
    const first = rail.points[0];
    const last = rail.points[rail.points.length - 1];
    const toStart = (/** @type {modlumi.Point3d} */ point) => getNearest(profiles[0], profileStations[0], point).distance;
    const toEnd = (/** @type {modlumi.Point3d} */ point) => getNearest(profiles[1], profileStations[1], point).distance;
    const flip = single ? toStart(last) < toStart(first) : toStart(first) + toEnd(last) > toStart(last) + toEnd(first);
    const oriented = flip ? reverse(rail) : rail;
    return { line: oriented, stations: flip ? getStations(oriented) : stations };
  });
  if (rails.some(({ stations }) => stations[stations.length - 1] <= kEpsilon)) {
    throw new Error("A rail has no length.");
  }

  /** @param {number} t @param {Frame | null} previous @returns {Frame} */
  const getFrame = (t, previous) => {
    const [a, b] = rails.map(({ line, stations }) => getPointAt(line, stations, t * stations[stations.length - 1]));
    const across = a.vectorTo(b);
    const width = across.length;
    const xAxis = width > kEpsilon ? across.normalize() : previous?.xAxis ?? new Vector3d(1, 0, 0);
    const direction = getRailDirection(rails[0].line, rails[0].stations, t)
      .add(getRailDirection(rails[1].line, rails[1].stations, t));
    const square = direction.subtract(xAxis.scale(direction.dot(xAxis)));
    let along = square.length > kEpsilon ? square : previous?.along ?? getAnyPerpendicular(xAxis);
    along = along.subtract(xAxis.scale(along.dot(xAxis)));
    along = along.length > kEpsilon ? along.normalize() : getAnyPerpendicular(xAxis);
    return { origin: a, xAxis, up: along.cross(xAxis), along, width };
  };

  // The section fractions along the rails.
  const fractions = options.sections > 0
    ? Array.from({ length: options.sections + 1 }, (_, index) => index / options.sections)
    : mergeFractions(rails.map(({ stations }) => stations.map((s) => s / stations[stations.length - 1])));
  /** @type {Frame[]} */
  const frames = [];
  for (const t of fractions) {
    frames.push(getFrame(t, frames.length === 0 ? null : frames[frames.length - 1]));
  }
  const ends = [frames[0], frames[frames.length - 1]];
  /** @param {Frame} frame */
  const heightScale = (frame) => options.scaleHeight ? frame.width : 1;
  /**
   * A point in a frame's coordinates: across in widths, up and along in widths or meters.
   * @param {Frame} frame @param {modlumi.Point3d} point
   */
  const toLocal = (frame, point) => {
    const offset = frame.origin.vectorTo(point);
    const height = heightScale(frame);
    return [offset.dot(frame.xAxis) / Math.max(frame.width, kEpsilon), offset.dot(frame.up) / Math.max(height, kEpsilon),
      offset.dot(frame.along) / Math.max(height, kEpsilon)];
  };
  if (ends.some((frame) => frame.width <= kEpsilon)) {
    throw new Error("The rails must touch each profile at two different points.");
  }

  // Each profile runs the same way around the rails, and is cut into parts where they touch it.
  const parts = (single ? [profiles[0]] : profiles).map((original, index) => {
    const frame = ends[index];
    let line = original;
    if (line.closed) {
      let area = 0;
      const local = line.points.map((point) => toLocal(frame, point));
      local.forEach(([u, v], corner) => {
        const [nextU, nextV] = local[(corner + 1) % local.length];
        area += u * nextV - nextU * v;
      });
      if (area < 0) {
        line = reverse(line);
      }
    }
    let stations = getStations(line);
    const length = stations[stations.length - 1];
    // Each rail must touch the profile, to within a hundredth of the section's width.
    const anchor = (/** @type {number} */ rail) => {
      const { points } = rails[rail].line;
      const nearest = getNearest(line, stations, points[index === 0 ? 0 : points.length - 1]);
      if (nearest.distance > Math.max(1e-6, frame.width / 100)) {
        throw new Error(`Rail ${rail + 1} doesn't touch the ${index === 0 ? "start" : "end"} profile.`);
      }
      return nearest.at;
    };
    let first = anchor(0);
    let second = anchor(1);
    if (!line.closed && first > second) {
      line = reverse(line);
      stations = getStations(line);
      first = length - first;
      second = length - second;
    }
    // The parts' starts and ends, as distances along the profile, and the distances to each
    // point of the profile within them.
    const bounds = line.closed
      ? [[first, first + ((second - first + length) % length)],
        [first + ((second - first + length) % length), first + length]]
      : [[0, first], [first, second], [second, length]];
    return bounds.map(([start, end]) => {
      const inner = [];
      for (const station of stations) {
        for (const shifted of line.closed ? [station, station + length] : [station]) {
          if (shifted > start + kEpsilon && shifted < end - kEpsilon) {
            inner.push((shifted - start) / (end - start));
          }
        }
      }
      return { line, stations, start, end, inner };
    });
  });

  if (single) {
    parts.push(parts[0]);
  }

  // Both profiles are sampled at the same fractions of each part: their own points and the other's.
  /** @type {modlumi.Point3d[][]} */
  const samples = [[], []];
  const partCount = parts[0].length;
  for (let part = 0; part < partCount; ++part) {
    const both = [parts[0][part], parts[1][part]];
    const empty = both.every(({ start, end }) => end - start <= kEpsilon);
    const at = empty ? [0] : mergeFractions([[0, 1], ...both.map(({ inner }) => inner)]);
    // A part starts where the one before it ends, and a closed profile's last part ends at its start.
    const from = part === 0 ? 0 : 1;
    const to = parts[0][0].line.closed && part === partCount - 1 ? at.length - 1 : at.length;
    both.forEach(({ line, stations, start, end }, index) => {
      for (let sample = from; sample < to; ++sample) {
        samples[index].push(getPointAt(line, stations, start + at[sample] * (end - start)));
      }
    });
  }
  // A single profile keeps its shape all the way, carried along by the rails.
  const local = samples.map((points, index) => points.map((point) => toLocal(ends[single ? 0 : index], point)));
  const sections = frames.map((frame, step) => {
    const t = fractions[step];
    const height = heightScale(frame);
    return local[0].map((start, index) => {
      const end = local[1][index];
      const [u, v, w] = start.map((value, axis) => value + (end[axis] - value) * t);
      return frame.origin.offset(frame.xAxis.scale(u * frame.width).add(frame.up.scale(v * height))
        .add(frame.along.scale(w * height)));
    });
  });
  return { sections, closed: profiles[0].closed };
}

/**
 * The faces of a swept surface, as polygons of points, capped at its ends when `cap` is set
 * and the profiles are closed. A capped surface's faces face outward.
 * @param {Sweep} swept
 * @param {boolean} cap
 */
function getPolygons(swept, cap) {
  const { sections, closed } = swept;
  /** @type {modlumi.Point3d[][]} */
  const polygons = [];
  /** @param {modlumi.Point3d[]} corners */
  const add = (corners) => {
    /** @type {modlumi.Point3d[]} */
    const distinct = [];
    for (const corner of corners) {
      if (distinct.every((other) => other.distance(corner) > kEpsilon)) {
        distinct.push(corner);
      }
    }
    if (distinct.length >= 3) {
      polygons.push(distinct);
    }
  };
  const count = sections[0].length;
  for (let step = 0; step + 1 < sections.length; ++step) {
    const [a, b] = [sections[step], sections[step + 1]];
    for (let index = 0; index < (closed ? count : count - 1); ++index) {
      const next = (index + 1) % count;
      add([a[index], a[next], b[next], b[index]]);
    }
  }
  if (closed && cap) {
    add([...sections[0]].reverse());
    add(sections[sections.length - 1]);
    // Six times the signed volume, from fans of triangles; faces turn outward when it's positive.
    let volume = 0;
    for (const polygon of polygons) {
      const [origin] = polygon;
      for (let index = 1; index + 1 < polygon.length; ++index) {
        const a = new Vector3d(...origin);
        volume += a.dot(new Vector3d(...polygon[index]).cross(new Vector3d(...polygon[index + 1])));
      }
    }
    if (volume < 0) {
      polygons.forEach((polygon) => polygon.reverse());
    }
  }
  return polygons;
}

/** @param {modlumi.PluginContext} context */
export function activate(context) {
  /** @type {(Pick | null)[]} The start profile, the end profile and the two rails. */
  let picks = [null, null, null, null];
  /** @type {Pick | null} What a click would pick. */
  let hover = null;
  /** @type {Sweep | string | null} The swept surface, or why it can't be swept. */
  let cached = null;
  /** Whether the next release is the end of a double-click that applied the sweep. */
  let releaseApplied = false;
  let sections = Number(context.settings.get("sections", 0));
  let scaleHeight = Boolean(context.settings.get("scaleHeight", true));
  let cap = Boolean(context.settings.get("cap", true));
  let smooth = Boolean(context.settings.get("smooth", true));

  function getSlot() {
    return picks.indexOf(null);
  }

  function getSweep() {
    if (getSlot() !== -1) {
      return null;
    }
    if (cached === null) {
      const [start, end, rail1, rail2] = /** @type {Pick[]} */ (picks);
      try {
        cached = sweep(start, end, rail1, rail2, { sections, scaleHeight });
      } catch (error) {
        cached = error instanceof Error ? error.message : String(error);
      }
    }
    return cached;
  }

  function showState() {
    const slot = getSlot();
    const swept = getSweep();
    tool.status = slot === 1
      ? "Click the end profile, or click the start profile again or press Enter to sweep one profile."
      : slot !== -1
        ? `Click ${kSlotNames[slot]}: ${slot === 0 ? "a face, curve or chain of edges" : "a curve or chain of edges"}.`
        : typeof swept === "string"
          ? `${swept} Press Escape to start over.`
          : "Press Enter or double-click to add the sweep. Type a number of sections like 24s.";
    tool.measurement = {
      label: "Sections",
      value: swept === null || typeof swept === "string" ? "" : String(swept.sections.length - 1),
    };
  }

  function reset() {
    picks = [null, null, null, null];
    hover = null;
    cached = null;
    showState();
  }

  /**
   * What clicking the entity under the pointer would pick for the next slot, or null.
   * @param {modlumi.ToolEvent} event
   * @returns {Pick | null}
   */
  function getCandidate(event) {
    const slot = getSlot();
    const picked = event.picked;
    if (slot === -1 || picked === null || picked.path.length !== model.activePath.length) {
      return null;
    }
    const { entity } = picked;
    const profile = slot < 2;
    if (entity.type === "Face") {
      if (!profile) {
        return null;
      }
      return slot === 1 && picks[0] !== null && "face" in picks[0] && picks[0].face === entity
        ? picks[0]
        : { face: /** @type {modlumi.Face} */ (entity) };
    }
    if (entity.type !== "Edge") {
      return null;
    }
    const edge = /** @type {modlumi.Edge} */ (entity);
    const owner = picks.find((pick) => pick !== null && getEdges(pick).includes(edge));
    if (owner !== undefined) {
      // Picking the start profile again sweeps it alone.
      return slot === 1 && owner === picks[0] ? owner : null;
    }
    /** @type {Set<modlumi.Edge>} */
    const excluded = new Set(picks.flatMap((pick) => pick === null ? [] : getEdges(pick)));
    return { edges: getChain(edge, excluded) };
  }

  function commit() {
    const swept = getSweep();
    if (swept === null || typeof swept === "string") {
      return;
    }
    const mesh = new modlumi.MeshBuilder();
    for (const polygon of getPolygons(swept, cap)) {
      mesh.addPolygon(polygon);
    }
    let group;
    try {
      group = model.operation("Rail Sweep", () => {
        const added = model.activeEntities.addGroup();
        added.entities.addMesh(mesh, { smoothAngle: smooth ? kSmoothAngle : 0 });
        return added;
      });
    } catch (error) {
      context.showMessage(`Can't sweep: ${error instanceof Error ? error.message : error}`);
      return;
    }
    reset();
    model.selection.clear();
    model.selection.add(group);
  }

  /** @param {string} text */
  function applyValue(text) {
    const match = /^(\d+)\s*s?$/i.exec(text.trim());
    if (match === null) {
      return false;
    }
    sections = Math.min(1000, Number(match[1]));
    context.settings.set("sections", sections);
    cached = null;
    return true;
  }

  const tool = context.registerTool({
    id: "rail-sweep",
    title: "Rail Sweep",
    tip: "Sweeps between two profiles along two rails.",
    snap: false,
    activate: reset,
    deactivate() {
      reset();
      releaseApplied = false;
    },
    onMouseMove(event) {
      hover = getCandidate(event);
    },
    onMouseUp(event) {
      if (releaseApplied) {
        releaseApplied = false;
        return;
      }
      const candidate = getCandidate(event);
      if (candidate !== null) {
        picks[getSlot()] = candidate;
        hover = null;
        cached = null;
      }
      showState();
    },
    onDoubleClick() {
      // The double-click's own release follows; it ends the gesture rather than picking again.
      releaseApplied = getSlot() === -1;
      commit();
    },
    onKeyDown(event) {
      if (event.key !== "enter") {
        return;
      }
      if (getSlot() === 1) {
        picks[1] = picks[0];
        cached = null;
        showState();
      } else {
        commit();
      }
    },
    onValue(text) {
      if (!applyValue(text)) {
        context.showMessage(`Can't use "${text}" as a number of sections`);
      }
      showState();
    },
    onCancel(reason) {
      if (reason === "escape") {
        reset();
      }
    },
    options(ui) {
      const chosen = ui.integer("Sections", sections, { min: 0, max: 1000, tip: "0 places a section at each rail point." });
      if (chosen !== sections) {
        sections = chosen;
        context.settings.set("sections", sections);
        cached = null;
      }
      const scale = ui.checkbox("Scale height with width", scaleHeight,
        { tip: "Scale each section evenly, or only across the rails." });
      if (scale !== scaleHeight) {
        scaleHeight = scale;
        context.settings.set("scaleHeight", scaleHeight);
        cached = null;
      }
      const capped = ui.checkbox("Cap ends", cap, { tip: "Close the ends of a sweep of closed profiles." });
      if (capped !== cap) {
        cap = capped;
        context.settings.set("cap", cap);
      }
      const smoothed = ui.checkbox("Smooth", smooth, { tip: "Soften the edges between sections." });
      if (smoothed !== smooth) {
        smooth = smoothed;
        context.settings.set("smooth", smooth);
      }
      const slot = getSlot();
      kSlotLabels.forEach((label, index) =>
        ui.readOnly(label, index === 1 && picks[1] !== null && picks[1] === picks[0] ? "Same as start"
          : picks[index] !== null ? "Picked" : index === slot ? "Click to pick" : ""));
      const swept = getSweep();
      if (typeof swept === "string") {
        ui.text(swept, { tone: "error" });
      }
      ui.row(() => {
        if (ui.button("Start Over", { disabled: picks[0] === null })) {
          reset();
        }
        if (ui.button("Sweep", { primary: true, disabled: swept === null || typeof swept === "string" })) {
          commit();
        }
      });
    },
    draw(view) {
      showState();
      const shown = /** @type {[Pick, modlumi.Color, string][]} */ (picks.flatMap((pick, index) =>
        pick === null || (index === 1 && pick === picks[0]) ? [] : [[pick, kPickColors[index], kSlotLabels[index]]]));
      if (hover !== null) {
        shown.push([hover, kHoverColor, ""]);
      }
      for (const [pick, color, label] of shown) {
        const { points, closed } = getPolyline(pick);
        view.polyline(closed ? [...points, points[0]] : points, { color, width: 3 });
        if (label !== "") {
          view.text(points[Math.floor((points.length - 1) / 2)], label, { color });
        }
      }
      const swept = getSweep();
      if (swept === null || typeof swept === "string") {
        return;
      }
      const { sections: rows, closed } = swept;
      for (const row of rows) {
        view.polyline(closed ? [...row, row[0]] : row, { color: kPreviewColor });
      }
      for (let index = 0; index < rows[0].length; ++index) {
        view.polyline(rows.map((row) => row[index]), { color: kPreviewColor, stipple: "dotted" });
      }
    },
  });

  // Undo, redo and edits elsewhere may change or remove what was picked.
  const refresh = () => {
    if (picks.some((pick) => pick !== null && !isValidPick(pick))) {
      reset();
    }
    // What was under the pointer may be gone; the next move finds it again.
    hover = null;
    cached = null;
  };
  context.onModelChanged(refresh);
  context.onActiveContextChanged(reset);
  context.onDocumentOpened(reset);
}
