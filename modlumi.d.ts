/**
 * Type declarations for the Modlumi scripting API.
 *
 * Modlumi runs JavaScript (ES2023) in an embedded QuickJS engine. Write scripts in
 * TypeScript, compile them with `tsc` against this file, and run the emitted `.js` file
 * from the script editor, with File → Run Script… or with `modlumi --run-script script.js`.
 * The script console runs JavaScript directly. Everything lives on the global `modlumi`
 * namespace; nothing needs to be imported.
 *
 * Lengths are meters, face areas square meters and angles radians. Entities, collections
 * and the model borrow the open document: they stop working once the document is replaced.
 */

declare namespace modlumi {
  /** A point given either as a {@link Point3d} or as an `[x, y, z]` tuple in meters. */
  type Point3dLike = Point3d | readonly [number, number, number];
  /** A vector given either as a {@link Vector3d} or as an `[x, y, z]` tuple. */
  type Vector3dLike = Vector3d | readonly [number, number, number];

  /** An immutable position in meters. Destructures as `const [x, y, z] = point`. */
  class Point3d implements Iterable<number> {
    /** Creates a point from coordinates, which default to 0. */
    constructor(x?: number, y?: number, z?: number);
    /** Converts a tuple, or returns an existing point unchanged. */
    static from(value: Point3dLike): Point3d;
    /** X coordinate. */
    readonly x: number;
    /** Y coordinate. */
    readonly y: number;
    /** Z coordinate. */
    readonly z: number;
    /** Returns this point moved by `vector`. */
    offset(vector: Vector3dLike): Point3d;
    /** Returns the displacement from this point to `point`. */
    vectorTo(point: Point3dLike): Vector3d;
    /** Distance to another point, in meters. */
    distance(point: Point3dLike): number;
    /** Applies a transformation, including its translation. */
    transform(transformation: Transformation): Point3d;
    /** Exact coordinate equality; compare {@link distance} with a tolerance for nearly equal points. */
    equals(other: Point3dLike): boolean;
    /** The coordinates as an `[x, y, z]` array. */
    toArray(): [number, number, number];
    [Symbol.iterator](): Iterator<number>;
  }

  /** An immutable direction and length. Destructures as `const [x, y, z] = vector`. */
  class Vector3d implements Iterable<number> {
    /** Creates a vector from components, which default to 0. */
    constructor(x?: number, y?: number, z?: number);
    /** Converts a tuple, or returns an existing vector unchanged. */
    static from(value: Vector3dLike): Vector3d;
    /** X component. */
    readonly x: number;
    /** Y component. */
    readonly y: number;
    /** Z component. */
    readonly z: number;
    /** Length of the vector. */
    readonly length: number;
    /** Component-wise sum. */
    add(other: Vector3dLike): Vector3d;
    /** Component-wise difference. */
    subtract(other: Vector3dLike): Vector3d;
    /** The vector pointing the opposite way. */
    negate(): Vector3d;
    /** Multiplies every component by `factor`. */
    scale(factor: number): Vector3d;
    /** Dot product. */
    dot(other: Vector3dLike): number;
    /** Cross product. */
    cross(other: Vector3dLike): Vector3d;
    /** A vector with the same direction and length 1. Throws `RangeError` for a zero vector. */
    normalize(): Vector3d;
    /** Angle to another vector, in radians. */
    angleBetween(other: Vector3dLike): number;
    /** Applies a transformation without its translation. */
    transform(transformation: Transformation): Vector3d;
    /** Exact component equality. */
    equals(other: Vector3dLike): boolean;
    /** The components as an `[x, y, z]` array. */
    toArray(): [number, number, number];
    [Symbol.iterator](): Iterator<number>;
  }

  /**
   * An immutable affine transformation. `a.multiply(b)` applies `b` first, then `a`.
   * Multiplying a point includes the translation; multiplying a vector doesn't.
   */
  class Transformation {
    /** Creates the identity transformation. */
    constructor();
    /** A translation by `vector`. */
    static translation(vector: Vector3dLike): Transformation;
    /**
     * A scale about `origin`, the model origin by default: uniform for one factor, or along X,
     * Y and Z for a vector of three. Negative factors mirror; a zero factor flattens, which
     * points and vectors accept but edits of the model reject.
     */
    static scaling(factors: number | Vector3dLike, origin?: Point3dLike): Transformation;
    /**
     * Maps the unit axes to `xAxis`, `yAxis` and `zAxis` at `origin`, so local coordinates
     * become those of a frame. The axes must not lie in one plane; their lengths scale.
     */
    static axes(origin: Point3dLike, xAxis: Vector3dLike, yAxis: Vector3dLike, zAxis: Vector3dLike): Transformation;
    /** Where the transformation moves the origin. */
    readonly origin: Point3d;
    /** Where the transformation maps the X axis, including any scale. */
    readonly xAxis: Vector3d;
    readonly yAxis: Vector3d;
    readonly zAxis: Vector3d;
    /** The twelve numbers of the matrix, row by row: each row's three axis components, then its translation. */
    toArray(): number[];
    /** A rotation by `angle` radians about `axis` through `origin`. */
    static rotation(origin: Point3dLike, axis: Vector3dLike, angle: number): Transformation;
    /** Composes transformations, or transforms a point or vector. */
    multiply(other: Transformation): Transformation;
    multiply(point: Point3d): Point3d;
    multiply(vector: Vector3d): Vector3d;
    /** The inverse transformation. Throws `RangeError` when there is none. */
    inverse(): Transformation;
    /** Exact matrix equality. */
    equals(other: Transformation): boolean;
  }

  /**
   * Collects points and polygons to add with {@link Entities.addMesh}, many faces at once.
   * Points at the same position are stored once, so polygons that share corners share
   * vertices and edges.
   *
   * ```js
   * const mesh = new modlumi.MeshBuilder();
   * mesh.addPolygon([[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0]]);
   * model.operation("Mesh", () => model.entities.addGroup().entities.addMesh(mesh));
   * ```
   */
  class MeshBuilder {
    constructor();
    readonly pointCount: number;
    readonly polygonCount: number;
    /** Adds a point, or finds one at the same position, and returns its index. */
    addPoint(point: Point3dLike): number;
    /**
     * Adds a polygon through three or more corners, counterclockwise around its front: points,
     * or indices of added points. Returns the polygon's index.
     */
    addPolygon(
      corners: Iterable<Point3dLike | number>,
      options?: { material?: Material | null; backMaterial?: Material | null },
    ): number;
  }

  /** An immutable axis-aligned box, in the coordinates of the context it was measured in. */
  class BoundingBox {
    /** Creates the box between two corners; `min` can't exceed `max` along any axis. */
    constructor(min: Point3dLike, max: Point3dLike);
    /** The corner with the smallest coordinates. */
    readonly min: Point3d;
    /** The corner with the largest coordinates. */
    readonly max: Point3d;
    readonly center: Point3d;
    /** Extent along X, in meters. */
    readonly width: number;
    /** Extent along Y, in meters. */
    readonly depth: number;
    /** Extent along Z, in meters. */
    readonly height: number;
    /** Distance between the corners, in meters. */
    readonly diagonal: number;
    /** Whether the point lies inside or on the box. */
    contains(point: Point3dLike): boolean;
  }

  /** Converts inches to meters. */
  function inches(value: number): number;
  /** Converts millimeters to meters. */
  function mm(value: number): number;
  /** Converts meters to inches. */
  function toInches(meters: number): number;
  /** Converts meters to millimeters. */
  function toMm(meters: number): number;

  /**
   * Thrown when the model rejects a query or an edit. Invalid arguments throw `TypeError` or
   * `RangeError` instead. A failed edit rolls back the current operation, even if the script
   * catches the error.
   */
  class ModelError extends Error {
    readonly name: "ModelError";
  }

  /** A straight RGBA color with components between 0 and 1. */
  interface Color {
    readonly r: number;
    readonly g: number;
    readonly b: number;
    readonly a: number;
  }

  /** Discriminant of every concrete entity class. */
  type EntityType = AnyEntity["type"];

  /**
   * Base class of everything stored in the model. Each model entity is represented by one
   * object, so `===`, `Set` and `Map` work as identity. Deleted entities keep `entityId`,
   * `isValid` and `isDeleted`; their other properties throw `ReferenceError` until undo
   * restores them.
   */
  abstract class Entity {
    protected constructor();
    /** The concrete class name, for narrowing unions such as {@link AnyElement}. */
    abstract readonly type: EntityType;
    /** Identifier that stays the same for the entity's lifetime, including across undo and redo. */
    readonly entityId: number;
    /** Whether the entity still exists in the model. */
    readonly isValid: boolean;
    /** Whether the entity was deleted, for example by an edit or by undo. */
    readonly isDeleted: boolean;
  }

  /** An entity that can be drawn, hidden and selected: edges, faces, groups, component instances and guides. */
  abstract class DrawingElement extends Entity {
    abstract readonly type: AnyDrawingElement["type"];
    /**
     * The element's bounds in its context's coordinates, or `null` when it has no geometry.
     * A group's or instance's bounds enclose its transformed contents and may be a little
     * larger than they are.
     */
    readonly bounds: BoundingBox | null;
    /**
     * The element's own hidden flag; assign inside {@link Model.operation}. Hidden ancestors
     * are not taken into account; use {@link Model.isDrawingElementVisible} for that.
     */
    hidden: boolean;
    /** The inverse of {@link hidden}; assign inside {@link Model.operation}. */
    visible: boolean;
  }

  /** A point where edges meet. */
  class Vertex extends Entity {
    readonly type: "Vertex";
    /**
     * Position in the vertex's own context, in meters. Assigning moves it inside
     * {@link Model.operation}, like {@link Entities.moveVertices}.
     */
    get position(): Point3d;
    set position(value: Point3dLike);
    /** The edges that meet at the vertex. */
    readonly edges: readonly Edge[];
  }

  /** A straight line segment between two vertices. */
  class Edge extends DrawingElement {
    readonly type: "Edge";
    /** The vertex the edge starts at. */
    readonly start: Vertex;
    /** The vertex the edge ends at. */
    readonly end: Vertex;
    /** Length in the edge's own context, in meters. */
    readonly length: number;
    /**
     * Whether the edge's line is suppressed so its faces read as one surface; assign inside
     * {@link Model.operation}. The solids from {@link Entities.addCylinder} and its relatives
     * soften their facet edges.
     */
    soft: boolean;
    /** Whether the edge is marked for smooth shading across its faces; assign inside {@link Model.operation}. */
    smooth: boolean;
    /** The curve or arc this edge belongs to, or `null`. */
    readonly curve: Curve | ArcCurve | null;
    /**
     * The edge's material, which colors its line, or `null` for the default; assign a material
     * of this model inside {@link Model.operation}.
     */
    material: Material | null;
    /** The faces the edge bounds: none for a loose edge, two between neighboring faces. */
    readonly faces: readonly Face[];
    /**
     * The edge's length after a transformation, such as {@link Model.activeTransformation}
     * for world lengths of edges in the context being edited.
     */
    transformedLength(transformation: Transformation): number;
  }

  /** A planar face bounded by one outer loop and any number of hole loops. */
  class Face extends DrawingElement {
    readonly type: "Face";
    /** Unit front normal in the face's own context, or `null` for a degenerate face. */
    readonly normal: Vector3d | null;
    /** Area in the face's own context, in square meters. */
    readonly area: number;
    /** The outer boundary loop. */
    readonly outerLoop: Loop;
    /** All boundary loops: the outer loop and every hole. */
    readonly loops: readonly Loop[];
    /**
     * Triangles that cover the face, holes left open, in the face's own context, as Modlumi
     * draws it. Each runs counterclockwise seen from the front.
     */
    readonly triangles: readonly (readonly [Point3d, Point3d, Point3d])[];
    /**
     * The front material, or `null` for the default. Assign a material of this model, or
     * `null`, inside {@link Model.operation}.
     */
    material: Material | null;
    /** The back material, or `null` for the default; assign like {@link material}. */
    backMaterial: Material | null;
    /**
     * How a texture is placed on the front, as SketchUp files store it: a row-major 3×3
     * projective matrix in inches, or `null` when the texture follows the face's default
     * projection. Read-only for now.
     */
    readonly uvTransform: readonly number[] | null;
    /** How a texture is placed on the back; see {@link uvTransform}. */
    readonly backUvTransform: readonly number[] | null;
    /** The face's area after a transformation, such as a scaled instance's, in square meters. */
    transformedArea(transformation: Transformation): number;
    /**
     * Extrudes the face by a signed distance in meters, like the Extrude tool. Positive
     * distances follow {@link normal}. Call it inside {@link Model.operation}.
     *
     * Returns the cap face, the same face when `distance` is zero, or `null` when the
     * extrusion cuts through an opposite face. Other faces may be replaced, so keep the
     * returned cap for further edits. Throws {@link ModelError} when the distance goes beyond
     * the first parallel opposite face or the geometry isn't supported.
     */
    extrude(distance: number): Face | null;
    /**
     * Sweeps the face along a path of two or more points in the face's own context, like the
     * Sweep tool. Repeat the first point at the end to close the path; a closed path around an
     * axis through the face's vertices revolves the face. Call it inside {@link Model.operation}.
     *
     * The swept surface replaces this face, which becomes deleted. Throws {@link ModelError}
     * when the path or the resulting geometry isn't supported.
     */
    sweep(path: Iterable<Point3dLike>): void;
    /**
     * Swaps the face's front and back sides, which flips {@link normal}. Each material stays
     * with its side. Call it inside {@link Model.operation}.
     */
    reverse(): void;
  }

  /** A closed chain of edge uses that bounds a face. */
  class Loop extends Entity {
    readonly type: "Loop";
    /** The loop's edge uses, in order around the loop. */
    readonly edgeUses: readonly EdgeUse[];
    /** The edges referenced by {@link edgeUses}, in the same order. */
    readonly edges: readonly Edge[];
    /** The face this loop bounds. */
    readonly face: Face;
  }

  /** One use of an edge by a loop, with the direction the loop runs along it. */
  class EdgeUse extends Entity {
    readonly type: "EdgeUse";
    /** The edge being used. */
    readonly edge: Edge;
    /** The vertex where the loop enters the edge. */
    readonly start: Vertex;
    /** The vertex where the loop leaves the edge. */
    readonly end: Vertex;
    /** Whether the loop runs from the edge's end to its start. */
    readonly isReversed: boolean;
  }

  /** A chain of edges that is edited as one, such as a polyline from a curve tool. */
  class Curve extends Entity {
    readonly type: "Curve" | "ArcCurve";
    /** The edges that make up the curve. */
    readonly edges: readonly Edge[];
  }

  /** A curve that approximates a circular arc or a full circle. */
  class ArcCurve extends Curve {
    readonly type: "ArcCurve";
    /** Center of the arc. */
    readonly center: Point3d;
    /** Unit normal of the arc's plane. */
    readonly normal: Vector3d;
    /** Direction that angles are measured from. */
    readonly xAxis: Vector3d;
    /** Radius in meters. */
    readonly radius: number;
    /** Start angle in radians, measured from {@link xAxis} around {@link normal}. */
    readonly startAngle: number;
    /** End angle in radians, measured from {@link xAxis} around {@link normal}. */
    readonly endAngle: number;
    /** Whether the arc is a full circle. */
    readonly isCircle: boolean;
  }

  /** Shared geometry that groups and component instances place in the model. */
  class ComponentDefinition extends Entity {
    readonly type: "ComponentDefinition";
    /** Definition name, shared by all its instances; assign inside {@link Model.operation}. */
    name: string;
    /** The definition's own entities, in definition-local coordinates. */
    readonly entities: Entities;
  }

  /** A container referencing a reusable component definition. */
  class ComponentInstance extends DrawingElement {
    /**
     * Gives the instance a copy of its definition when other instances share it, so editing
     * it leaves them alone; the copy is named like `"Chair#2"`. Call it inside
     * {@link Model.operation}.
     */
    makeUnique(): void;
    readonly type: "ComponentInstance";
    /** Name of this container only; assign inside {@link Model.operation}. */
    name: string;
    /** The definition this instance places. */
    readonly definition: ComponentDefinition;
    /**
     * Maps definition-local coordinates into the parent context. Assigning replaces the
     * transformation; do so inside {@link Model.operation}.
     */
    transformation: Transformation;
    /**
     * Applies a transformation in the parent context, so the new transformation is
     * `transformation.multiply(old)`. Call it inside {@link Model.operation}.
     */
    transform(transformation: Transformation): void;
    /**
     * The material applied to the whole instance, which faces without their own show, or
     * `null`. Assign a material of this model, or `null`, inside {@link Model.operation}.
     */
    material: Material | null;
    /** Whether the definition's geometry is a closed solid; see {@link Entities.isSolid}. */
    readonly isSolid: boolean;
    /**
     * The volume the instance encloses, scaled by its transformation, in cubic meters, or
     * `null` when it isn't a solid.
     */
    readonly volume: number | null;
  }

  /** A placed group of entities with its own definition. */
  class Group extends DrawingElement {
    readonly type: "Group";
    /** Group name; assign inside {@link Model.operation}. */
    name: string;
    /** The group's definition. */
    readonly definition: ComponentDefinition;
    /** The entities inside the group, in group-local coordinates. */
    readonly entities: Entities;
    /**
     * Maps group-local coordinates into the parent context. Assigning replaces the
     * transformation; do so inside {@link Model.operation}.
     */
    transformation: Transformation;
    /**
     * Applies a transformation in the parent context, so the new transformation is
     * `transformation.multiply(old)`. Call it inside {@link Model.operation}.
     */
    transform(transformation: Transformation): void;
    /**
     * Gives the group a definition of its own when copies share it, so editing its entities
     * leaves the copies alone. Call it inside {@link Model.operation}.
     */
    makeUnique(): void;
    /**
     * The material applied to the whole group, which faces without their own show, or `null`.
     * Assign a material of this model, or `null`, inside {@link Model.operation}.
     */
    material: Material | null;
    /** Whether the group's geometry is a closed solid; see {@link Entities.isSolid}. */
    readonly isSolid: boolean;
    /**
     * The volume the group encloses, scaled by its transformation, in cubic meters, or `null`
     * when it isn't a solid.
     */
    readonly volume: number | null;
  }

  /** A named color that faces, edges and containers can use. */
  /** An image a {@link Material} repeats over faces. */
  interface Texture {
    /** The bytes of a PNG or JPEG file, up to 32 MiB. */
    readonly image: Uint8Array | ArrayBuffer;
    /** Width of one repeat in meters; 1 by default when assigning. */
    readonly width?: number;
    /** Height of one repeat in meters; 1 by default when assigning. */
    readonly height?: number;
  }

  /**
   * A named color, optionally with an image, that faces and containers can use. Create one
   * with {@link Model.addMaterial}; change its properties inside {@link Model.operation}.
   */
  class Material extends Entity {
    readonly type: "Material";
    /** Material name; names needn't be unique. */
    name: string;
    /**
     * Red, green, blue and alpha, each from 0 to 1. Assigning accepts a color without `a`,
     * which is then 1.
     */
    get color(): Color;
    set color(value: Color | { r: number; g: number; b: number; a?: number });
    /** The material's image and the size of one repeat, or `null`. Assign `null` to remove it. */
    get texture(): Required<Texture> & { readonly image: Uint8Array } | null;
    set texture(value: Texture | null);
  }

  /** A construction point or infinite construction line. Guides don't form faces. */
  class Guide extends DrawingElement {
    readonly type: "Guide";
    /** The guide point, or a point on the guide line. */
    readonly position: Point3d;
    /** Direction of the guide line; the zero vector for a guide point. */
    readonly direction: Vector3d;
    /** Whether the guide is a point rather than a line. */
    readonly isPoint: boolean;
  }

  type AnyEntity =
    | Vertex
    | Edge
    | Face
    | Loop
    | EdgeUse
    | Curve
    | ArcCurve
    | ComponentDefinition
    | ComponentInstance
    | Group
    | Material
    | Guide;
  /** The concrete drawing elements. */
  type AnyDrawingElement = Edge | Face | Group | ComponentInstance | Guide;
  /** What a drawing context contains: drawing elements, guides included. */
  type AnyElement = AnyDrawingElement;

  /**
   * Where a shape or solid sits. Its base plane passes through the origin or center given
   * to the method.
   */
  interface PlaneOptions {
    /**
     * Direction the shape's front faces, and the direction a solid's height runs. Defaults
     * to `[0, 0, 1]`, which lays shapes flat and stands solids upright.
     */
    normal?: Vector3dLike;
    /**
     * Direction of the shape's first axis: a rectangle's width, or the first corner of a
     * circle or polygon. Its component along `normal` is ignored. Defaults to `[1, 0, 0]`
     * for a vertical `normal`, and otherwise to the horizontal direction that makes the
     * second axis point up.
     */
    xAxis?: Vector3dLike;
  }

  /** Options for round shapes and solids. */
  interface RoundOptions extends PlaneOptions {
    /**
     * Number of straight segments around the circle, 3 to 360 (96 for spheres); defaults to
     * 24. Drawing time grows much faster than the count: hundreds of segments take seconds.
     */
    segments?: number;
  }

  /**
   * The elements of one drawing context: the model root, a group or a component
   * definition. Iteration takes a snapshot. All edits must happen inside {@link Model.operation}.
   */
  class Entities implements Iterable<AnyElement> {
    private constructor();
    /** Number of elements. */
    readonly length: number;
    /** Returns the element at `index`, counting from the end when negative. */
    at(index: number): AnyElement | undefined;
    /** A snapshot of the elements. */
    toArray(): AnyElement[];
    /** Returns the elements of the given type. */
    ofType<T extends AnyElement["type"]>(type: T): Extract<AnyElement, { type: T }>[];
    [Symbol.iterator](): Iterator<AnyElement>;
    /** All vertices in this context. */
    readonly vertices: readonly Vertex[];
    /** The bounds of everything in this context, in its coordinates, or `null` when it's empty. */
    readonly bounds: BoundingBox | null;
    /**
     * Whether this context holds a closed solid: only faces and edges, with every edge bounding
     * exactly two faces that run along it in opposite directions. Guides don't count.
     */
    readonly isSolid: boolean;
    /**
     * The volume the solid in this context encloses, in cubic meters, or `null` when it isn't a
     * solid. Shells inside other shells are cavities.
     */
    readonly volume: number | null;
    /**
     * Draws connected line segments through two or more points. Segments split where they
     * cross existing edges, and closing a planar outline can create a face. Returns the
     * edges that now lie on the requested segments, in model order; there isn't
     * necessarily one edge per segment.
     */
    addEdges(points: Iterable<Point3dLike>): Edge[];
    /**
     * Draws a closed planar outline through three or more points and returns the face it
     * bounds. The outline closes itself, so the first point needn't be repeated. The face's
     * front is the side the points run counterclockwise around.
     *
     * Like {@link addEdges}, the outline merges with the geometry it touches. An outline
     * drawn on a larger face cuts its own face out of it. Retracing an existing face returns
     * that face with its orientation unchanged. Throws {@link ModelError} when the outline
     * doesn't end up bounding exactly one face: when it isn't planar, crosses itself or
     * existing edges, or only retraces edges that bound no face.
     */
    addFace(points: Iterable<Point3dLike>): Face;
    /**
     * Draws a rectangle with one corner at `origin`, `width` along the plane's first axis and
     * `height` along its second, and returns its face. By default it lies flat with its front
     * facing up, so `addRectangle([0, 0, 0], 4, 3).extrude(2)` makes a box. See {@link addFace}
     * for how the outline merges and when it throws.
     */
    addRectangle(origin: Point3dLike, width: number, height: number, options?: PlaneOptions): Face;
    /**
     * Draws a circle and returns its face. The boundary is a true circle: its edges share an
     * {@link ArcCurve} with the center and radius. See {@link addFace} for how the outline
     * merges and when it throws.
     */
    addCircle(center: Point3dLike, radius: number, options?: RoundOptions): Face;
    /**
     * Draws a regular polygon with `sides` corners (3 to 360) at `radius` from `center`, and
     * returns its face. The first corner lies along the plane's first axis. See {@link addFace}
     * for how the outline merges and when it throws.
     */
    addPolygon(center: Point3dLike, radius: number, sides: number, options?: PlaneOptions): Face;
    /** Adds a construction point. */
    addGuidePoint(position: Point3dLike): Guide;
    /** Adds an infinite construction line through `position` along `direction`. */
    addGuideLine(position: Point3dLike, direction: Vector3dLike): Guide;
    /**
     * Moves elements of this context into a new group and returns it. Faces take their
     * boundary edges along. Without elements it returns an empty group; draw into its
     * {@link Group.entities} to build geometry that doesn't merge with its surroundings.
     */
    addGroup(elements?: Iterable<DrawingElement>): Group;
    /**
     * Moves elements of this context into a new component definition and returns its first
     * instance. `name` names the definition and defaults to `"Component"`.
     */
    addComponent(elements: Iterable<DrawingElement>, name?: string): ComponentInstance;
    /**
     * Adds a box as a new group. One corner sits at `origin`; `width`, `depth` and `height`
     * run along the plane's first axis, its second axis and its normal.
     *
     * Solids are groups, so they never merge with geometry they touch. Inside the group the
     * solid sits at the origin with its height along Z, and the group's
     * {@link Group.transformation} places it. Move or rotate it afterward with
     * {@link Group.transform}.
     */
    addBox(
      origin: Point3dLike,
      width: number,
      depth: number,
      height: number,
      options?: PlaneOptions,
    ): Group;
    /**
     * Adds a cylinder as a new group, with its base circle around `center` and its height
     * along the plane's normal. See {@link addBox} for how solids are placed.
     */
    addCylinder(center: Point3dLike, radius: number, height: number, options?: RoundOptions): Group;
    /**
     * Adds a cone as a new group, with its base circle around `center` and its tip `height`
     * along the plane's normal. See {@link addBox} for how solids are placed.
     */
    addCone(center: Point3dLike, radius: number, height: number, options?: RoundOptions): Group;
    /**
     * Adds a sphere around `center` as a new group. Its poles lie along the plane's normal.
     * See {@link addBox} for how solids are placed.
     */
    addSphere(center: Point3dLike, radius: number, options?: RoundOptions): Group;
    /**
     * Rounds edges of this context with a circular arc of `radius` meters tangent to both
     * faces, like the Bevel tool. Each edge must join two noncoplanar faces, and each edge end
     * must be a corner where exactly three edges meet. `segments`, 1 to 64, defaults to 6.
     * Throws {@link ModelError} without changing anything when the radius doesn't fit.
     */
    fillet(edges: Iterable<Edge>, radius: number, options?: { segments?: number }): void;
    /**
     * Cuts edges of this context with one flat face set back `distance` meters along both
     * adjacent faces, like the Chamfer tool. The same edge and corner rules as {@link fillet} apply.
     */
    chamfer(edges: Iterable<Edge>, distance: number): void;
    /**
     * Cuts edges of this context with one flat face at any angle, like the Bevel tool. The cut is
     * set back `distance` meters along each edge's reference face: `referenceFaces` is one face
     * adjacent to every edge, or one adjacent face per edge in order. `angle` is the angle
     * between the cut and the reference face in degrees, default 45; `secondDistance` instead
     * sets the setback in meters along the other face. A cut that would remove a whole face
     * throws {@link ModelError}. The same edge and corner rules as {@link fillet} apply.
     */
    bevel(
      edges: Iterable<Edge>,
      referenceFaces: Face | Iterable<Face>,
      distance: number,
      options?: { angle?: number; secondDistance?: number },
    ): void;
    /**
     * Draws a curve through two or more points, like the Freehand tool: connected edges that
     * are edited as one. Repeat the first point at the end to close it. Returns the curves
     * drawn: one, or more where the stroke runs over existing curves, which stay as they are,
     * or none when it runs over them entirely.
     */
    addCurve(points: Iterable<Point3dLike>): readonly Curve[];
    /**
     * Draws an arc of `radius` around `center` from `startAngle` to `endAngle` in radians,
     * measured from the plane's first axis toward its second, as a curve of `segments`
     * straight edges: by default one per 15°. A full turn closes it. Returns the curves drawn,
     * like {@link addCurve}.
     */
    addArc(
      center: Point3dLike,
      radius: number,
      startAngle: number,
      endAngle: number,
      options?: PlaneOptions & { segments?: number },
    ): readonly Curve[];
    /**
     * Adds a mesh's polygons as faces, much faster than drawing them one by one: a hundred
     * thousand faces take seconds. Corners at the same position share vertices and edges.
     * A polygon that isn't planar becomes a fan of triangles from its first corner, with soft
     * and smooth diagonals; keep such polygons convex. Edges between faces that meet at less
     * than `smoothAngle` radians are softened and smoothed. The mesh doesn't merge with
     * geometry already here, so add it to an empty group. Returns the faces, in polygon
     * order. Call it inside {@link Model.operation}. A mesh has at most 1,048,576 points,
     * 1,048,576 polygons and 4,194,304 polygon corners; add bigger ones in parts.
     */
    addMesh(mesh: MeshBuilder, options?: { smoothAngle?: number }): readonly Face[];
    /**
     * Moves each vertex of this context by its own offset, in one step: the equivalent of
     * moving many points of a mesh at once. Faces the moves bend fold into planar faces, as
     * when moving with the Move tool; moves that collapse an edge or face throw
     * {@link ModelError}. Arcs stay arcs only when all their vertices move alike.
     */
    moveVertices(vertices: Iterable<Vertex>, offsets: Iterable<Vector3dLike>): void;
    /**
     * Joins `merged` into `kept`, which stays where it is: `merged`'s edges end at `kept`
     * instead, an edge that would repeat one of `kept`'s joins it, and the edge between the two
     * goes. Faces stay the same faces; one left with fewer than three sides goes, keeping its
     * edges. Throws {@link ModelError}, changing nothing, when a face would pinch at `kept`,
     * bend out of its plane or lose its area. Curves and arcs through `merged` become plain
     * edges. Call it inside {@link Model.operation}.
     */
    mergeVertices(kept: Vertex, merged: Vertex): void;
    /**
     * Joins pairs of collinear edges that meet at a vertex no other edge reaches, removing that
     * vertex, when both bound the same faces and share flags, material and curve: the split
     * edges imports and some edits leave behind. Considers the given vertices of this context,
     * or all of them. Returns how many vertices went.
     */
    mergeCollinearEdges(vertices?: Iterable<Vertex>): number;
    /**
     * Splits an edge of this context at a point on it, or at a parameter from 0 at its start
     * to 1 at its end, and returns the two edges. Both keep the edge's faces, curve and flags.
     */
    splitEdge(edge: Edge, at: Point3dLike | number): readonly [Edge, Edge];
    /**
     * Joins edges of this context into one curve, in order along their chain. They must form
     * one open or closed chain without branches. Edges leave the curves they were in; what
     * remains of those stays curved in its unbroken runs.
     */
    weld(edges: Iterable<Edge>): Curve;
    /**
     * Replaces groups and component instances of this context with their contents, placed by
     * their transformations, and returns the elements that took their place.
     */
    explode(containers: Iterable<Group | ComponentInstance>): AnyDrawingElement[];
    /**
     * Draws the outline of a face of this context, holes included, moved `distance` meters into
     * the face, or out of it for a negative distance, like the Offset tool, and returns the
     * curves drawn. Throws {@link ModelError} when the offset collapses the outline.
     */
    offsetFace(face: Face, distance: number): readonly Curve[];
    /**
     * Erases edges between faces that lie in one plane and face the same way, merging those
     * faces, and returns how many edges went. With `sameMaterials`, the default, only faces
     * with the same front and back materials merge. A curve goes only when all its edges may,
     * and faces the model can't merge, such as overlapping ones, keep the edges between them.
     */
    mergeCoplanarFaces(options?: { sameMaterials?: boolean }): number;
    /** Erases one entity, subject to the model's topology rules. */
    erase(entity: AnyEntity): void;
    /**
     * Erases several edges at once and heals the faces around them. Erasing any edge of a curve
     * erases the whole curve. Collinear edges left meeting at an erased edge's end that nothing
     * else reaches are joined into one, as after erasing a line drawn across a face.
     */
    eraseEdges(edges: Iterable<Edge>): void;
    /**
     * Draws edges into this context wherever a face of `faces` crosses a face of `others`, like
     * Intersect Faces, splitting the faces of this context they cross. Like drawn edges, new
     * edges that close a planar loop fill it with a face, such as across the inside of a box
     * cut by a plane. Faces of this context
     * are passed as they are; faces of other contexts come with the transformation that maps
     * their coordinates into this one, so a sibling group's faces can cut this one. Coplanar
     * overlapping faces each receive the other's outline. Returns the edges along the
     * intersections, including existing ones. Call it inside {@link Model.operation}.
     *
     * @example
     * ```js
     * // Cuts the faces of a group with a large square in its parent, then removes the square.
     * const cutter = model.entities.addGroup();
     * const square = cutter.entities.addFace([[-5, -5, 0.5], [5, -5, 0.5], [5, 5, 0.5], [-5, 5, 0.5]]);
     * const toGroup = group.transformation.inverse();
     * group.entities.intersectFaces(group.entities.ofType("Face"), [{ face: square, transformation: toGroup }]);
     * model.entities.erase(cutter);
     * ```
     */
    intersectFaces(
      faces: Iterable<Face | { face: Face; transformation: Transformation }>,
      others: Iterable<Face | { face: Face; transformation: Transformation }>,
    ): readonly Edge[];
    /**
     * Moves elements of this context by a transformation in this context's coordinates.
     * Shared boundary vertices move once. Returns `false` when `entities` is empty.
     */
    transformEntities(transformation: Transformation, entities: Iterable<DrawingElement>): boolean;
    /**
     * Copies elements of this context, transformed, and returns the new elements. The
     * originals don't change. Face boundaries, complete curves and holes are copied too,
     * groups and instances keep their definitions, and copies don't merge with geometry
     * they intersect.
     */
    copyEntities(transformation: Transformation, entities: Iterable<DrawingElement>): AnyDrawingElement[];
    /**
     * Adds edges to this context where the faces among `elements` cross those among `others`,
     * like Intersect Faces, and returns the edges along the crossings. Faces of this context
     * are split by the new edges. Loose geometry of this context whose faces overlap in one
     * plane, such as a box moved onto a slab, is welded into one surface first. Groups and
     * components contribute their faces, nested ones included, but their own geometry doesn't
     * change. Without `others`, the elements are intersected with each other. Call it inside
     * {@link Model.operation}.
     */
    intersectWith(elements: Iterable<DrawingElement>, others?: Iterable<DrawingElement>): Edge[];
    /**
     * Replaces solid groups and components of this context with one group holding their union.
     * All solid tools need {@link Group.isSolid} solids, replace their inputs with new groups,
     * and throw {@link ModelError} without changing anything when the result wouldn't be a
     * solid. Call them inside {@link Model.operation}.
     */
    union(solids: Iterable<Group | ComponentInstance>): Group;
    /** Replaces two solids with a group holding `target` with `cutter` removed. See {@link union}. */
    subtract(target: Group | ComponentInstance, cutter: Group | ComponentInstance): Group;
    /** Replaces two or more solids with a group holding only what all of them share. See {@link union}. */
    intersect(solids: Iterable<Group | ComponentInstance>): Group;
    /**
     * Cuts `cutter` out of `target` and keeps `cutter`. Returns the group replacing `target`, or
     * `null` when nothing of it is left. See {@link union}.
     */
    trim(target: Group | ComponentInstance, cutter: Group | ComponentInstance): Group | null;
    /**
     * Replaces two solids with up to three groups: what lies only in `first`, in both, and only
     * in `second`, in that order. Empty parts are left out. Throws {@link ModelError} when the
     * solids don't overlap. See {@link union}.
     */
    split(first: Group | ComponentInstance, second: Group | ComponentInstance): Group[];
    /**
     * Replaces one or more solids with a group holding the outside of their union, without inner
     * faces or hollows. See {@link union}.
     */
    outerShell(solids: Iterable<Group | ComponentInstance>): Group;
    /**
     * Changes `target` in place to its union with, difference from or intersection with
     * `modifier`, which stays. Unlike the other solid tools, `target` keeps its container, name,
     * paint and placement, and its unpainted faces, including those it takes from `modifier`,
     * go on showing its paint. Every instance of a shared component definition changes; a group
     * whose copies share its definition is made unique first. Throws {@link ModelError} without
     * changing anything when an input isn't a solid or the result would be empty or no solid.
     * Call it inside {@link Model.operation}.
     */
    modifySolid(
      target: Group | ComponentInstance,
      modifier: Group | ComponentInstance,
      operation: "union" | "subtract" | "intersect",
    ): void;
  }

  /**
   * The current selection. Changing it doesn't need an operation and isn't undoable. Only
   * live drawing elements in the active editing context can be selected.
   */
  class Selection implements Iterable<AnyDrawingElement> {
    private constructor();
    /** Number of selected elements. */
    readonly length: number;
    /** Returns the selected element at `index`, counting from the end when negative. */
    at(index: number): AnyDrawingElement | undefined;
    /** A snapshot of the selected elements. */
    toArray(): AnyDrawingElement[];
    [Symbol.iterator](): Iterator<AnyDrawingElement>;
    /** Whether the element is selected. */
    has(entity: DrawingElement): boolean;
    /** Adds an element. Returns whether it wasn't selected before. */
    add(entity: DrawingElement): boolean;
    /** Removes an element. Returns whether it was selected. */
    remove(entity: DrawingElement): boolean;
    /** Deselects everything. */
    clear(): void;
  }

  /** Options for a {@link Camera}. */
  interface CameraOptions {
    /** Up direction; defaults to `[0, 0, 1]`. */
    up?: Vector3dLike;
    /** `true` for a perspective camera and `false` for a parallel projection; defaults to `true`. */
    perspective?: boolean;
    /** Vertical field of view in degrees; defaults to 45. */
    fieldOfView?: number;
  }

  /**
   * An immutable camera, for image export or the {@link Viewport}. Positions are world meters,
   * which are model coordinates.
   */
  class Camera {
    /** Creates a camera at `eye` looking at `target`. */
    constructor(eye: Point3dLike, target: Point3dLike, options?: CameraOptions);
    /** Camera position. */
    readonly eye: Point3d;
    /** The point the camera looks at. */
    readonly target: Point3d;
    /** Up direction. */
    readonly up: Vector3d;
    /** `true` for a perspective camera and `false` for a parallel projection. */
    readonly perspective: boolean;
    /** Vertical field of view in degrees. */
    readonly fieldOfView: number;
  }

  /** Options for {@link Viewport.setCamera}. */
  interface CameraMoveOptions {
    /** Seconds the move takes, up to 60; defaults to 0, which moves the camera at once. */
    duration?: number;
  }

  /**
   * The viewport of the desktop window, from {@link PluginContext.viewport}. Positions are in
   * model coordinates, and screen positions in logical pixels from the viewport's top left.
   */
  interface Viewport {
    /** The camera the viewport shows the model with, as of now. */
    readonly camera: Camera;
    /** Logical pixels; 0 while the window has no size. */
    readonly width: number;
    readonly height: number;
    /**
     * Moves the camera, gliding over `duration` seconds when given. The move starts after the
     * plugin's code for this frame, so {@link camera} returns the camera as shown until then,
     * and {@link PluginContext.onCameraChanged} listeners hear each step. The user's own
     * navigation stops a glide, as do the plugin stopping and another model opening.
     *
     * @example
     * ```js
     * // Looks at the origin from the front, in a parallel projection, over half a second.
     * const front = new modlumi.Camera([0, -20, 1.5], [0, 0, 1.5], { perspective: false });
     * context.viewport.setCamera(front, { duration: 0.5 });
     * ```
     */
    setCamera(camera: Camera, options?: CameraMoveOptions): void;
    /** Where a point shows in the viewport, as `[x, y]`, or `null` when it is behind the camera. */
    project(point: Point3dLike): readonly [number, number] | null;
    /** The ray from the camera through a viewport position, or `null` while the viewport has no size. */
    ray(x: number, y: number): { readonly origin: Point3d; readonly direction: Vector3d } | null;
  }

  /** Options for {@link View.writeImage}. */
  interface ImageOptions {
    /** Pixels, 1 to 8192; defaults to 800. */
    width?: number;
    /** Pixels, 1 to 8192; defaults to 600. */
    height?: number;
  }

  /**
   * An export view with its own camera. Get it from {@link Model.activeView}. Changing its
   * camera doesn't move the camera in the desktop window.
   */
  class View {
    private constructor();
    /** The view's camera. Assign a {@link Camera} to change it. */
    camera: Camera;
    /**
     * Renders the committed model to a PNG file. Existing files are overwritten; the folder
     * must exist. Call it outside operations. Throws `RangeError` for invalid arguments and
     * {@link ModelError} when rendering or writing fails. Scripts only: plugins get a
     * `PermissionError`, since they write files through {@link PluginFiles.save}.
     */
    writeImage(filename: string, options?: ImageOptions): void;
  }

  /** How the model shows lengths. See {@link Model.units}. */
  interface UnitSettings {
    /** The unit lengths without a suffix are in, and shown in. */
    readonly lengthUnit: "in" | "ft" | "mm" | "cm" | "m" | "yd";
    /** Decimal places shown. */
    readonly decimals: number;
    /** Whether lengths are shown with their unit, such as `"m"`. */
    readonly showSuffix: boolean;
  }

  /** The face a ray hit. See {@link Model.raytest}. */
  interface RayHit {
    /** Where the ray hits the face, in world meters. */
    readonly point: Point3d;
    readonly face: Face;
    /** The groups and instances above the face, from the model root down. */
    readonly path: readonly (Group | ComponentInstance)[];
    /** How far along the ray the hit is, in multiples of the direction's length. */
    readonly distance: number;
  }

  /** Options for {@link Model.isDrawingElementVisible}, simulating the View menu's reveal options. */
  interface VisibilityOptions {
    showHiddenGeometry?: boolean;
    showHiddenObjects?: boolean;
  }

  /** The document the script runs against. Get it from {@link activeModel}. */
  class Model {
    private constructor();
    /** The entities at the model root. */
    readonly entities: Entities;
    /** The entities of the context being edited, such as an open group. */
    readonly activeEntities: Entities;
    /** The current selection. */
    readonly selection: Selection;
    /** All component and group definitions. */
    readonly definitions: readonly ComponentDefinition[];
    /** All materials. */
    readonly materials: readonly Material[];
    /** The view for image export. */
    readonly activeView: View;
    /** The groups and instances being edited, from the model root down; empty at the root. */
    readonly activePath: readonly (Group | ComponentInstance)[];
    /**
     * Maps the coordinates of {@link activeEntities} to world coordinates: the transformations of
     * {@link activePath} multiplied together.
     */
    readonly activeTransformation: Transformation;
    /** How the model shows lengths. */
    readonly units: UnitSettings;
    /**
     * Runs `body` as one named undo step and returns its result. Every edit must happen
     * inside an operation. A thrown error, or any failed edit inside `body` (even when
     * caught), rolls the whole operation back. Empty operations add no undo step.
     * Operations can't be nested, and `body` must be synchronous.
     */
    operation<T>(name: string, body: () => T): T;
    /** Undoes the last operation. Not allowed inside an operation. */
    undo(): void;
    /** Redoes the last undone operation. Not allowed inside an operation. */
    redo(): void;
    /**
     * Adds a material, white by default, with an optional texture, inside
     * {@link Model.operation}. Throws `RangeError` for color components outside 0 to 1 or a
     * texture that isn't a PNG or JPEG file.
     */
    addMaterial(
      name: string,
      options?: { color?: Color | { r: number; g: number; b: number; a?: number }; texture?: Texture | null },
    ): Material;
    /**
     * Removes component definitions that no group or instance reachable from the model root
     * uses, with their contents, and then materials nothing left uses. Call it inside
     * {@link Model.operation}. Returns how many of each went.
     */
    purgeUnused(): { readonly definitions: number; readonly materials: number };
    /**
     * Removes a material inside {@link Model.operation}. Faces, groups and instances that use it
     * show their default or inherited appearance again.
     */
    removeMaterial(material: Material): void;
    /** Formats a length in meters the way the model shows lengths, such as `"1.200 m"`. */
    formatLength(meters: number): string;
    /** Formats an area in square meters in the model's units, such as `"6.000 m²"`. */
    formatArea(squareMeters: number): string;
    /** Formats a volume in cubic meters in the model's units, such as `"2.000 m³"`. */
    formatVolume(cubicMeters: number): string;
    /**
     * Reads a length the way the measurements box does, such as `"1.2m"`, `"18cm"`, `"7\""` or
     * `"5' 3 1/2\""`, and returns it in meters. A number without a unit is in the model's
     * {@link UnitSettings.lengthUnit}. Returns `null` for text that isn't a length.
     */
    parseLength(text: string): number | null;
    /**
     * Casts a ray from `origin` along `direction`, both in world coordinates, through the whole
     * model, and returns the nearest face it hits from either side, or `null`. Hidden faces and
     * faces in hidden groups and instances are skipped unless `includeHidden` is set.
     */
    raytest(origin: Point3dLike, direction: Vector3dLike, options?: { includeHidden?: boolean }): RayHit | null;
    /**
     * Whether an element is visible, taking hidden ancestors into account. `path` lists the
     * element's ancestors from the model root down to the element itself.
     */
    isDrawingElementVisible(path: readonly DrawingElement[], options?: VisibilityOptions): boolean;
  }

  /** The model the script runs against. */
  const activeModel: Model;

  /** An inference a tool's point snapped to; see {@link ToolPoint.inferences}. */
  type InferenceName =
    | "origin"
    | "componentOrigin"
    | "endpoint"
    | "intersection"
    | "midpoint"
    | "arcMidpoint"
    | "onEdge"
    | "onFace"
    | "center"
    | "guidePoint"
    | "onLine"
    | "redAxis"
    | "greenAxis"
    | "blueAxis"
    | "fromPoint"
    | "parallel"
    | "extendEdge"
    | "perpendicular"
    | "perpendicularToFace"
    /** A target from a {@link PluginContext.addSnapProvider} snap provider. */
    | "snap"
    | "free"
    | "other";

  /**
   * The point under the pointer, snapped the way the built-in tools snap: to endpoints,
   * midpoints, edges and faces, along the axes from {@link PluginTool.reference}, and locked
   * to an axis with the arrow keys or to the current inference with Shift.
   */
  interface ToolPoint {
    /** In the coordinates of the context being edited, like {@link Model.activeEntities}. */
    readonly position: Point3d;
    /** In world coordinates. */
    readonly worldPosition: Point3d;
    /** What the point snapped to, most specific first. */
    readonly inferences: readonly InferenceName[];
    readonly vertex: Vertex | null;
    readonly edge: Edge | null;
    readonly face: Face | null;
    /** The groups and instances above what the point snapped to, from the model root down. */
    readonly path: readonly (Group | ComponentInstance)[];
  }

  /** What happened, handed to a tool's handlers. */
  interface ToolEvent {
    readonly type: "activate" | "deactivate" | "suspend" | "resume" | "move" | "down" | "up" | "doubleClick"
      | "keyDown" | "keyUp" | "value" | "cancel";
    /** Pointer position in logical viewport pixels. */
    readonly x: number;
    readonly y: number;
    readonly shift: boolean;
    /** Ctrl, or Cmd on macOS. */
    readonly ctrl: boolean;
    readonly alt: boolean;
    /** For key events: a letter, `"enter"`, `"backspace"`, `"escape"`, `"space"`, an arrow such as `"left"`, or a modifier. */
    readonly key: string | null;
    readonly repeat: boolean;
    /** For `"value"`: what the user typed in the measurement box. */
    readonly text: string | null;
    /** For `"cancel"`: why the gesture ended. */
    readonly reason: "escape" | "reselected" | "history" | "focusLost" | null;
    /** The snapped point under the pointer, or `null` over empty space. */
    readonly point: ToolPoint | null;
    /**
     * The deepest entity under the pointer, such as a face inside a group, and the groups and
     * instances above it, from the model root down. The Select tool would pick the first of
     * `path` below {@link Model.activePath}, or `entity` when there is none.
     */
    readonly picked: { readonly entity: AnyEntity; readonly path: readonly (Group | ComponentInstance)[] } | null;
  }

  /**
   * How a {@link ToolView} shape looks. Points are in the coordinates of the context being
   * edited, or, with `screen`, `[x, y]` logical viewport pixels.
   */
  interface PreviewStyle {
    /** Dark gray by default. */
    color?: Color | { r: number; g: number; b: number; a?: number };
    /** Line width, or point size, in logical pixels; 1 by default, 6 for points. */
    width?: number;
    stipple?: "solid" | "dashed" | "dotted";
    screen?: boolean;
  }

  /** What a tool's draw function draws its preview with. */
  interface ToolView {
    /** Separate segments, one from each pair of points. */
    lines(points: Iterable<Point3dLike | readonly [number, number]>, style?: PreviewStyle): void;
    polyline(points: Iterable<Point3dLike | readonly [number, number]>, style?: PreviewStyle): void;
    /** A filled convex polygon. */
    polygon(points: Iterable<Point3dLike | readonly [number, number]>, style?: PreviewStyle): void;
    points(points: Iterable<Point3dLike | readonly [number, number]>, style?: PreviewStyle): void;
    /** Text at a point, or at screen pixels. */
    text(position: Point3dLike | readonly [number, number], text: unknown, style?: PreviewStyle): void;
    /**
     * An image stretched over four corners: its top left, top right, bottom right and bottom
     * left. In model coordinates the image bends with the perspective; with `screen: true` the
     * corners are screen pixels, as for a photo to match the model to. Images draw over the
     * model and the other shapes, at `opacity` from 0 to 1.
     *
     * @example
     * ```js
     * // Shows a photo over the top left of the viewport, half see-through.
     * const photo = context.loadImage("site.jpg");
     * context.addOverlay((view) => {
     *   const [w, h] = [photo.width / 4, photo.height / 4];
     *   view.image(photo, [[20, 60], [20 + w, 60], [20 + w, 60 + h], [20, 60 + h]], { screen: true, opacity: 0.5 });
     * });
     * ```
     */
    image(
      image: PluginImage,
      corners: readonly [
        Point3dLike | readonly [number, number],
        Point3dLike | readonly [number, number],
        Point3dLike | readonly [number, number],
        Point3dLike | readonly [number, number],
      ],
      style?: { readonly screen?: boolean; readonly opacity?: number },
    ): void;
  }

  /**
   * An image a plugin loaded with {@link PluginContext.loadImage} or
   * {@link PluginContext.createImage}, for {@link ToolView.image}. It lasts until the plugin
   * disposes of it or stops.
   */
  interface PluginImage {
    /** Pixels. */
    readonly width: number;
    readonly height: number;
    /**
     * A copy of the image's pixels: four bytes of red, green, blue and alpha each, in rows from
     * the top, such as for reading a heightmap.
     */
    pixels(): Uint8Array;
    /** The image encoded as a PNG file, to write with {@link PluginFile.writeBytes}. */
    toPng(): Uint8Array;
    /** Frees the image's pixels; views no longer draw it. */
    dispose(): void;
  }

  /**
   * An interactive tool a plugin adds, which the user picks from the Extensions menu or the
   * toolbar like a built-in tool. See {@link PluginContext.registerTool}.
   *
   * Handlers run once per frame for what happened since the last one, in order, and may edit
   * the model inside {@link Model.operation}. They must be synchronous. After them,
   * `draw` describes the preview, which shows until the next run.
   */
  interface ToolDefinition {
    /** Identifies the tool within its plugin: letters, digits, dots, dashes or underscores. */
    id: string;
    /** The tool's name, in its menu entry, tooltip and the status bar. */
    title: string;
    tip?: string;
    /** A keyboard shortcut, as for {@link CommandDefinition.shortcut}. */
    shortcut?: string;
    /** An SVG file in the plugin folder, as for {@link CommandDefinition.icon}. */
    icon?: string;
    /** Also show the tool in the plugin's toolbar group. Needs an `icon`. */
    toolbar?: boolean;
    activate?(event: ToolEvent): void;
    deactivate?(event: ToolEvent): void;
    /** A navigation tool, such as Orbit with the middle button, takes over for a while. */
    suspend?(event: ToolEvent): void;
    resume?(event: ToolEvent): void;
    onMouseMove?(event: ToolEvent): void;
    /** The left button went down; the right button opens the context menu instead. */
    onMouseDown?(event: ToolEvent): void;
    onMouseUp?(event: ToolEvent): void;
    onDoubleClick?(event: ToolEvent): void;
    onKeyDown?(event: ToolEvent): void;
    onKeyUp?(event: ToolEvent): void;
    /**
     * The user typed in the measurement box and pressed Enter. Read lengths with
     * {@link Model.parseLength}.
     */
    onValue?(text: string, event: ToolEvent): void;
    /** Escape, picking another tool or undo ended the gesture. */
    onCancel?(reason: NonNullable<ToolEvent["reason"]>, event: ToolEvent): void;
    /**
     * Whether the pointer snaps and shows inferences like the drawing tools; `true` by default.
     * Tools that only pick what is under the pointer turn it off, and their events have no `point`.
     */
    snap?: boolean;
    /** Describes the preview drawn over the model. */
    draw?(view: ToolView): void;
    /**
     * Draws the tool's options, in a card over the top left of the viewport while the tool is
     * selected, with the same widgets as panels. Changing an option keeps the tool's gesture
     * going, and the preview draws again.
     */
    options?(ui: Ui): void;
  }

  /** The handle of a registered tool, which sets what it shows. */
  interface PluginTool {
    readonly id: string;
    /** The status bar's instruction, such as `"Click a vertex to move it."`. */
    status: string;
    /** The measurement box's label and value, such as `{ label: "Distance", value: "1.2 m" }`. */
    measurement: { readonly label: string; readonly value: string };
    /**
     * Where inference starts from, such as the first click of a line, in the coordinates of the
     * context being edited; `null` for none. Points then snap along the axes from it, and the
     * arrow keys lock those axes.
     */
    reference: Point3d | null;
  }

  /** A command a plugin adds to Modlumi's menus. See {@link PluginContext.registerCommand}. */
  interface CommandDefinition {
    /** Identifies the command within its plugin: letters, digits, dots, dashes or underscores. */
    id: string;
    /** The menu entry's text, in title case, such as `"Select Coplanar Faces"`. */
    title: string;
    /** One sentence about what the command does, shown as its tooltip. */
    tip?: string;
    /**
     * When the command can run: `"always"` (the default), or only while something is
     * selected (`"selection"`). Unavailable commands are shown disabled.
     */
    when?: "always" | "selection";
    /** Also list the command in the viewport's right-click menu while something is selected. */
    contextMenu?: boolean;
    /**
     * A keyboard shortcut, such as `"Ctrl+Shift+K"`: Ctrl, Alt or Shift with a letter, digit
     * or F1 to F12. Letters and digits need Ctrl or Alt, because plain keys choose tools and
     * type measurements. Ctrl is Cmd on macOS. A shortcut that Modlumi or another plugin
     * already uses is dropped and logged; one with the wrong form throws `TypeError`.
     */
    shortcut?: string;
    /**
     * An SVG file in the plugin folder, such as `"icons/stairs.svg"`, drawn on the toolbar.
     * It is drawn as a single-color mask in the toolbar's colors, so only the opacity of its
     * shapes counts. Draw on a 24-unit square with 1.5-unit strokes to match Modlumi's icons.
     * Files up to 256 KiB; a missing or unreadable icon throws `TypeError`.
     */
    icon?: string;
    /** Also show the command as a toolbar button, in a group for the plugin. Needs an `icon`. */
    toolbar?: boolean;
    /**
     * Whether the command can run now, beyond `when`. Unavailable commands are shown
     * disabled. Modlumi asks after the plugin activates, after each of its commands, and
     * after the model, selection, active context or document changes, so base the answer on
     * those. It must return synchronously and only read, like a change listener; a command
     * whose `isEnabled` throws is disabled.
     */
    isEnabled?(): boolean;
    /**
     * Shows the command with a check mark while this returns `true`, for commands that
     * toggle something. Asked at the same times as {@link CommandDefinition.isEnabled}.
     */
    isChecked?(): boolean;
    /**
     * Runs the command. Edit the model inside {@link Model.operation}, so each run is one undo
     * step. Errors are shown to the user and logged.
     */
    run(): void | Promise<void>;
  }

  /**
   * A function a plugin's change listener runs. It may be async, but its promises must settle
   * during the run: only a command's run can wait for {@link PluginContext.fetch} or a file
   * dialog.
   */
  type ChangeListener = () => void | Promise<void>;

  /** A part of the plugin API added within its version; see {@link PluginContext.features}. */
  type PluginFeature =
    | "viewport"
    | "images"
    | "files"
    | "fileFormats"
    | "network"
    | "faceEdgeData"
    | "mergeVertices"
    | "edgeMaterials";

  /**
   * A plugin's settings for the current user, such as preferences, kept outside models.
   * Values are stored as JSON, as `JSON.stringify` writes them, so `get` returns a copy.
   * Changes are saved right away and are not undoable. A plugin's settings can take up to
   * 1 MiB of JSON.
   *
   * ```js
   * const segments = context.settings.get("segments", 24);
   * context.settings.set("segments", segments * 2);
   * ```
   */
  interface PluginSettings {
    /** Returns the value stored under `key`, or `undefined` when there is none. */
    get<T = unknown>(key: string): T | undefined;
    /** Returns the value stored under `key`, or `defaultValue` when there is none. */
    get<T>(key: string, defaultValue: T): T;
    /** Stores a JSON value under `key`; `undefined` removes it. */
    set(key: string, value: unknown): void;
  }

  /**
   * One JSON value a plugin keeps in the open model. It is saved in `.modl` files and
   * reverts with undo and redo; a new or opened document starts with that document's
   * value, or none. Values are stored as `JSON.stringify` writes them, up to 1 MiB.
   *
   * ```js
   * const count = context.documentData.get() ?? 0;
   * context.documentData.set(count + 1);
   * ```
   */
  interface DocumentData {
    /** Returns a copy of the plugin's value in the open model, or `undefined` when it has none. */
    get<T = unknown>(): T | undefined;
    /**
     * Stores the plugin's value in the open model; `undefined` removes it. Inside
     * {@link Model.operation} the change joins that operation; otherwise it is an undo
     * step of its own. Storing the current value again adds no undo step.
     */
    set(value: unknown): void;
  }

  /**
   * Options every widget accepts. `id` identifies the widget instead of its label, for
   * widgets whose label changes or repeats.
   */
  interface WidgetOptions {
    /** Identifies the widget within its section, tab or column instead of its label. */
    id?: string;
    /** Shown while the widget is hovered. */
    tip?: string;
    /** Shows the widget grayed out; it ignores the user. */
    disabled?: boolean;
  }

  /** Accepted range of a numeric field, in the field's own units: meters, radians or plain numbers. */
  interface RangeOptions extends WidgetOptions {
    min?: number;
    max?: number;
  }

  /** Options of a decimal number field. */
  interface NumberOptions extends RangeOptions {
    /** Shown decimals; 3 by default. */
    decimals?: number;
  }

  /** Options of a slider. */
  interface SliderOptions extends WidgetOptions {
    /** 0 by default. */
    min?: number;
    /** 1 by default. */
    max?: number;
    /** Shown decimals; 2 by default. */
    decimals?: number;
    /** Text after the value, such as `"%"`. */
    suffix?: string;
    /** Only whole numbers. */
    integer?: boolean;
  }

  /** One field of {@link Ui.form}: its widget type, label and that widget's options. */
  type FormField =
    | ({ type: "text"; label?: string; hint?: string } & WidgetOptions)
    | ({ type: "textBox"; label?: string; lines?: number } & WidgetOptions)
    | ({ type: "number" | "angle"; label?: string } & NumberOptions)
    | ({ type: "integer" | "length"; label?: string } & RangeOptions)
    | ({ type: "slider"; label?: string } & SliderOptions)
    | ({ type: "checkbox" | "toggle"; label?: string } & WidgetOptions)
    | ({ type: "radio" | "dropdown"; label?: string; choices: readonly string[] } & WidgetOptions)
    | ({ type: "color"; label?: string; alpha?: boolean } & WidgetOptions)
    | ({ type: "material"; label?: string } & WidgetOptions);

  /** One item of {@link Ui.tree}. */
  interface TreeItem {
    /** Identifies the item among all items of the tree. */
    id: string;
    /** The item's text; its id by default. */
    label?: string;
    /** The items it folds. */
    children?: readonly TreeItem[];
    /** Whether the item starts unfolded; the tree remembers what the user folds afterward. */
    open?: boolean;
  }

  /** A column of {@link Ui.table}: its title, or the title and alignment. */
  type TableColumn = string | { title: string; /** Right-aligns the column, for numbers. */ numeric?: boolean };

  /** A row of {@link Ui.table}. Cells are shown as text, one per column. */
  interface TableRow {
    /** Identifies the row among all rows of the table. */
    id: string;
    cells: readonly unknown[];
  }

  /** Options of {@link Ui.table}. */
  interface TableOptions extends WidgetOptions {
    /** Rows visible before the table scrolls; 10 by default. */
    visibleRows?: number;
  }

  /**
   * How a {@link Canvas} shape looks. A shape with an `id` reports clicks and drags on it in
   * {@link CanvasEvent.item}.
   */
  interface CanvasStyle {
    id?: string;
    /** Outline or line color, or text color; `null` for none. Lines and outlines default to light gray. */
    stroke?: Color | null;
    /** Fill of polygons, rectangles and circles; none by default. */
    fill?: Color | null;
    /** Line width in pixels; 1 by default. */
    width?: number;
  }

  /** A 2D point on a {@link Canvas}, in pixels from its top-left corner, y down. */
  type CanvasPoint = readonly [number, number];

  /**
   * Draws shapes on a canvas of {@link Ui.canvas}. Later shapes draw over earlier ones and are
   * hit first.
   */
  interface Canvas {
    line(points: readonly CanvasPoint[], style?: CanvasStyle): void;
    polygon(points: readonly CanvasPoint[], style?: CanvasStyle): void;
    rect(x: number, y: number, width: number, height: number, style?: CanvasStyle): void;
    circle(center: CanvasPoint, radius: number, style?: CanvasStyle): void;
    /** Text whose top-left corner is `position`, in the theme's text color unless stroked. */
    text(position: CanvasPoint, text: unknown, style?: CanvasStyle): void;
  }

  /** What the user did with the mouse on a canvas. */
  interface CanvasEvent {
    /**
     * `"click"`, `"doubleClick"`, `"drag"` while moving with a button held after pressing on the
     * canvas, and `"release"` when such a drag ends.
     */
    readonly type: "click" | "doubleClick" | "drag" | "release";
    /** Mouse position in canvas pixels. */
    readonly x: number;
    readonly y: number;
    /** A drag's movement since the previous drag event. */
    readonly dx: number;
    readonly dy: number;
    /** The id of the topmost shape the click or drag started on, or `null`. */
    readonly item: string | null;
    /** 0 for the left button, 1 for the right and 2 for the middle. */
    readonly button: number;
  }

  /**
   * Draws the widgets of a plugin's panel or dialog, the same widgets Modlumi's own panels
   * use. Value widgets take the current value and return it, or the user's change of it:
   *
   * ```js
   * state.width = ui.length("Width", state.width, { min: 0.1 });
   * if (ui.button("Build", { primary: true })) build(state);
   * ```
   *
   * Consecutive fields line up in a form, labels on the left. A widget is identified by its
   * label within the sections, tabs and columns around it, so keep labels stable or pass an
   * `id`. Repeated labels are told apart by their order.
   */
  interface Ui {
    /** Wrapped text, optionally in a tone. */
    text(text: unknown, options?: WidgetOptions & { tone?: "normal" | "muted" | "success" | "warning" | "error" }): void;
    heading(text: unknown, options?: WidgetOptions): void;
    /** A horizontal rule, with an optional title set into it. */
    separator(title?: string, options?: WidgetOptions): void;
    /** Vertical space between groups of widgets. */
    spacing(): void;
    /** A labeled value that can't be edited. */
    readOnly(label: string, value: unknown, options?: WidgetOptions): void;
    textField(label: string, value: string, options?: WidgetOptions & { hint?: string }): string;
    /** Multi-line text that wraps; 4 visible lines by default. */
    textBox(label: string, value: string, options?: WidgetOptions & { lines?: number }): string;
    /** A decimal number; typed text outside the range is refused. */
    number(label: string, value: number, options?: NumberOptions): number;
    integer(label: string, value: number, options?: RangeOptions): number;
    /**
     * A length in meters, shown in the model's units. It accepts everything the
     * measurements box accepts, such as `1.2m`, `18cm`, `7"` or `5' 3 1/2"`.
     */
    length(label: string, meters: number, options?: RangeOptions): number;
    /** An angle in radians, shown and typed in degrees. */
    angle(label: string, radians: number, options?: NumberOptions): number;
    /** Drag to change; Ctrl+click to type a value. */
    slider(label: string, value: number, options?: SliderOptions): number;
    checkbox(label: string, value: boolean, options?: WidgetOptions): boolean;
    /** An on/off switch, for settings that apply right away. */
    toggle(label: string, value: boolean, options?: WidgetOptions): boolean;
    /** Chooses one of a few options shown side by side; returns the chosen one. */
    radio<T extends string>(label: string, value: T, choices: readonly T[], options?: WidgetOptions): T;
    /** Chooses one of many options from a list; returns the chosen one. */
    dropdown<T extends string>(label: string, value: T, choices: readonly T[], options?: WidgetOptions): T;
    color(label: string, value: Color, options?: WidgetOptions & { alpha?: boolean }): Color;
    /**
     * Chooses one of the model's materials, shown with their colors, or `null` for the default
     * material. Assign the result inside {@link Model.operation} in the draw that reports it.
     */
    material(label: string, value: Material | null, options?: WidgetOptions): Material | null;
    /**
     * Returns `true` in the draw that reports the click. That draw may edit the model, so
     * call {@link Model.operation} right there.
     */
    button(label: string, options?: WidgetOptions & { primary?: boolean }): boolean;
    /**
     * A tree of selectable items, such as an outliner. Returns the selected item's id, or the
     * user's new choice; `null` when nothing is selected. Arrows fold and unfold items.
     */
    tree(label: string, items: readonly TreeItem[], selected: string | null, options?: WidgetOptions): string | null;
    /**
     * A table whose columns sort when the user clicks their header; cells that start with a
     * number, such as `"1.2 m"`, sort by it. Pass the selected row's id, or `null`, and get the
     * user's new choice back. Pass an array of ids instead to let Ctrl+click and Shift+click
     * select several rows; the result is then an array too.
     */
    table(
      label: string,
      columns: readonly TableColumn[],
      rows: readonly TableRow[],
      selection: string | null,
      options?: TableOptions,
    ): string | null;
    table(
      label: string,
      columns: readonly TableColumn[],
      rows: readonly TableRow[],
      selection: readonly string[],
      options?: TableOptions,
    ): string[];
    /**
     * A canvas `height` pixels high that fills the window's width. `draw` adds its shapes and
     * receives what the user did with the mouse on it, or `null`, so it can show the effect
     * right away; `canvas` returns the same event. The draw that reports an event may edit the
     * model, like a clicked button's.
     *
     * ```js
     * ui.canvas("Nodes", 200, (canvas, event) => {
     *   if (event?.type === "drag" && event.item === "node") {
     *     node.x += event.dx;
     *     node.y += event.dy;
     *   }
     *   canvas.rect(node.x, node.y, 80, 40, { id: "node", fill: { r: 0.2, g: 0.3, b: 0.5, a: 1 } });
     * });
     * ```
     */
    canvas(
      label: string,
      height: number,
      draw: (canvas: Canvas, event: CanvasEvent | null) => void,
      options?: WidgetOptions,
    ): CanvasEvent | null;
    /** A progress bar from 0 to 1, with optional text over it. */
    /**
     * Shows an image the plugin loaded, at its own size in pixels, or at a `width` or `height`
     * that keeps its proportions when only one is given.
     */
    image(image: PluginImage, options?: WidgetOptions & { width?: number; height?: number }): void;
    progress(fraction: number, options?: WidgetOptions & { text?: string }): void;
    /** A heading that folds the widgets `draw` adds; open by default. */
    section(title: string, draw: () => void, options?: WidgetOptions & { open?: boolean }): void;
    /** Places the widgets `draw` adds side by side, such as a row of buttons. */
    row(draw: () => void, options?: WidgetOptions): void;
    /** Equal-width columns, one per function. */
    columns(draws: readonly (() => void)[], options?: WidgetOptions): void;
    /** Tabs, from each tab's title to the function that draws it. */
    tabs(pages: Readonly<Record<string, () => void>>, options?: WidgetOptions): void;
    /** Grays out the widgets `draw` adds while `when` is true. */
    disabled(when: boolean, draw: () => void): void;
    /**
     * Draws one field per entry of `schema`, identified by its key, and returns a copy of
     * `values` with the user's changes.
     *
     * ```js
     * state = ui.form(state, {
     *   width: { type: "length", label: "Width", min: 0.1 },
     *   shape: { type: "dropdown", label: "Shape", choices: ["Straight", "L-shaped"] },
     * });
     * ```
     */
    form<T extends Record<string, unknown>>(values: T, schema: Readonly<Record<string, FormField>>): T;
    /** Closes this panel or dialog. */
    close(): void;
  }

  /**
   * Describes the widgets of a panel or dialog. Modlumi calls it every frame while the
   * window is open. It must be synchronous. A draw only reads the model, like a change
   * listener, except the draw right after the user changed a widget: there widgets return
   * the change, and it may edit the model and the selection.
   */
  type DrawFunction = (ui: Ui) => void;

  /** A dockable panel a plugin adds. See {@link PluginContext.addPanel}. */
  interface PanelDefinition {
    /** Identifies the panel within its plugin: letters, digits, dots, dashes or underscores. */
    id: string;
    /** The panel's title, also its entry in the Window menu. */
    title: string;
    draw: DrawFunction;
    /** Size when the panel first opens, in pixels; 320 by 420 by default. */
    width?: number;
    height?: number;
  }

  /** A dialog a plugin shows. See {@link PluginContext.showDialog}. */
  interface DialogDefinition {
    /** Identifies the dialog within its plugin; showing the same id again reuses the dialog. */
    id: string;
    title: string;
    draw: DrawFunction;
    /** Blocks the rest of Modlumi until the dialog closes. */
    modal?: boolean;
    /** Size when the dialog first opens, in pixels; by default it fits its content. */
    width?: number;
    height?: number;
    /**
     * Runs when the user closes the dialog with its close button; it may edit the model. Like a
     * {@link ChangeListener}, it may be async but can't wait for the network or a file dialog.
     */
    onClose?(): void | Promise<void>;
  }

  /**
   * A section a plugin adds to Properties. See {@link PluginContext.addPropertiesSection}.
   */
  interface PropertiesSectionDefinition {
    /** Identifies the section within its plugin: letters, digits, dots, dashes or underscores. */
    id: string;
    /** The section's heading. */
    title: string;
    /**
     * Draws the section for `container`, the one selected group or component instance that
     * holds the plugin's data. Like a panel's draw, it only reads, except right after the user
     * changed a widget: then it may edit the model, for example rebuild `container`.
     */
    draw(ui: Ui, container: Group | ComponentInstance): void;
  }

  /** What {@link EntityData} can hold a value on. */
  type DataHolder = Face | Edge | Group | ComponentInstance | ComponentDefinition | Material;

  /**
   * One JSON value a plugin keeps on each face, edge, group, component instance, component
   * definition and material, saved with the model and undoable like {@link DocumentData}.
   *
   * - Copies keep it, and so do the definitions {@link Group.makeUnique} copies.
   * - Each piece of a face or edge that splits gets the same value, so values that must be
   *   unique, such as ids, belong on groups rather than faces.
   * - When faces or edges become one, as when erasing the edge between two faces, the value of
   *   the one that stays wins and the other's is dropped.
   * - Modlumi never reads the value. Put a version in it, such as `{ version: 2, ... }`, and
   *   convert older ones when reading them.
   * - Values are at most 1 MiB of JSON each, and a model holds at most 256 MiB of one
   *   plugin's values, counting the copies the model holds of tagged entities.
   *
   * While exactly one container holding a plugin's value is selected, the plugin's Properties
   * sections show.
   */
  interface EntityData {
    /** Returns a copy of the plugin's value on `holder`, or `undefined` when it has none. */
    get<T = unknown>(holder: DataHolder): T | undefined;
    /**
     * Stores the plugin's value on `holder`; `undefined` removes it. Inside
     * {@link Model.operation} the change joins that operation; otherwise it is an undo step
     * of its own.
     */
    set(holder: DataHolder, value: unknown): void;
  }

  /** A plugin's panel. */
  interface Panel {
    readonly id: string;
    /** Whether the panel is open. */
    readonly isOpen: boolean;
    show(): void;
    hide(): void;
  }

  /** A plugin's dialog. */
  interface Dialog {
    readonly id: string;
    /** Whether the dialog is open. */
    readonly isOpen: boolean;
    close(): void;
  }

  /** Options of {@link PluginContext.confirm}. */
  interface ConfirmOptions {
    /** The dialog's title; the plugin's name by default. */
    title?: string;
    /** "OK" by default. */
    confirmLabel?: string;
    /** "Cancel" by default. */
    cancelLabel?: string;
    /** Runs when the user confirms; it may edit the model. */
    onConfirm?(): void;
    /** Runs when the user cancels or closes the dialog. */
    onCancel?(): void;
  }

  /**
   * What a plugin's entry module receives in its exported `activate` function:
   *
   * ```js
   * export function activate(context) {
   *   context.registerCommand({ id: "hello", title: "Say Hello", run: () => context.showMessage("Hello") });
   * }
   * ```
   *
   * A plugin is a folder with a `plugin.json` manifest and its entry module, `index.js` by
   * default. Its module stays loaded while Modlumi runs, so module-level variables keep
   * their values between commands. When the user turns the plugin off in the Extensions
   * window, Modlumi calls the module's exported `deactivate()`, if it has one, and then
   * removes the plugin's commands and listeners.
   */
  interface PluginContext {
    /** The plugin's id from plugin.json. */
    readonly id: string;
    /** The plugin's name from plugin.json. */
    readonly name: string;
    /** The plugin's version from plugin.json. */
    readonly version: string;
    /**
     * Adds a command to the plugin's submenu in the Extensions menu. Registering an id
     * again replaces that command.
     */
    registerCommand(command: CommandDefinition): void;
    /**
     * Adds an interactive tool, listed in the plugin's submenu of the Extensions menu, where
     * choosing it selects it, and optionally in the toolbar. Returns its handle. Tools and
     * commands share ids.
     *
     * ```js
     * const tool = context.registerTool({
     *   id: "mark",
     *   title: "Mark Points",
     *   activate: () => { tool.status = "Click to add a guide point."; },
     *   onMouseUp(event) {
     *     if (event.point) model.operation("Mark", () => model.activeEntities.addGuidePoint(event.point.position));
     *   },
     * });
     * ```
     */
    registerTool(tool: ToolDefinition): PluginTool;
    /** Shows a short message to the user, such as the result of a command. */
    showMessage(text: string): void;
    /**
     * Adds a dockable panel, listed in the Window menu, where the user opens and closes it.
     * Panels start closed; Modlumi remembers which ones the user left open and where.
     * Adding an id again replaces its definition.
     *
     * ```js
     * const state = { width: 1, steps: 12 };
     * context.addPanel({
     *   id: "stairs",
     *   title: "Stairs",
     *   draw(ui) {
     *     state.width = ui.length("Width", state.width);
     *     state.steps = ui.integer("Steps", state.steps, { min: 1 });
     *   },
     * });
     * ```
     */
    addPanel(panel: PanelDefinition): Panel;
    /** Shows a dialog, or brings back the open one with the same id with this definition. */
    showDialog(dialog: DialogDefinition): Dialog;
    /** Shows a message in a modal dialog with an OK button. */
    alert(message: unknown, options?: { title?: string }): void;
    /** Asks a question in a modal dialog with confirm and cancel buttons. */
    confirm(message: unknown, options?: ConfirmOptions): void;
    /**
     * Calls `listener` after the selection changes. Returns a function that removes it.
     * See {@link PluginContext.onModelChanged} for when listeners run.
     */
    onSelectionChanged(listener: ChangeListener): () => void;
    /**
     * Calls `listener` after the model changes: an edit, an undo or a redo, by the user, a
     * script or a plugin. Returns a function that removes it.
     *
     * Listeners run once per frame for everything that changed during it, in this order:
     * document closed, document opened, active context, selection, model. They receive no
     * arguments; read what they need from {@link activeModel}. Listeners only read, so the
     * user can keep drawing: editing the model or the selection, undo and redo throw
     * `ModelError`. Use a command for edits. A listener that runs for more than a second is
     * stopped and its plugin restarted. Listener errors are logged and never stop other
     * listeners.
     *
     * ```js
     * context.onModelChanged(() => {
     *   const faces = modlumi.activeModel.entities.ofType("Face").length;
     *   console.log(`${faces} faces`);
     * });
     * ```
     */
    onModelChanged(listener: ChangeListener): () => void;
    /**
     * Calls `listener` after the user enters or leaves a group or component. Returns a
     * function that removes it.
     */
    onActiveContextChanged(listener: ChangeListener): () => void;
    /**
     * Calls `listener` after New or Open replaced the open document, once the new document
     * is open. Returns a function that removes it.
     */
    onDocumentOpened(listener: ChangeListener): () => void;
    /**
     * Calls `listener` after New or Open replaced the open document, just before the
     * {@link PluginContext.onDocumentOpened} listeners. The previous document is already gone.
     * Returns a function that removes it.
     */
    onDocumentClosed(listener: ChangeListener): () => void;
    /**
     * Calls `listener` after the camera moved: orbiting, panning, zooming, a standard view or
     * {@link Viewport.setCamera}. While the user orbits it runs every frame, so keep it quick.
     * Returns a function that removes it.
     */
    onCameraChanged(listener: ChangeListener): () => void;
    /** Calls `listener` after the viewport changed size. Returns a function that removes it. */
    onViewResized(listener: ChangeListener): () => void;
    /** The viewport of the desktop window: its live camera and size. */
    readonly viewport: Viewport;
    /** The plugin's settings for the current user. */
    readonly settings: PluginSettings;
    /** The plugin's value stored in the open model. */
    readonly documentData: DocumentData;
    /** The plugin's values stored on faces, edges, groups, component instances, definitions and materials. */
    readonly entityData: EntityData;
    /**
     * Adds a section to Properties, shown while the selection is one group or component
     * instance holding the plugin's {@link PluginContext.entityData}. This is how a plugin lets
     * the user re-edit objects it made:
     *
     * ```js
     * context.addPropertiesSection({
     *   id: "box",
     *   title: "Box",
     *   draw(ui, container) {
     *     const size = context.entityData.get(container);
     *     const changed = ui.length("Size", size);
     *     if (changed !== size) rebuild(container, changed);
     *   },
     * });
     * ```
     */
    addPropertiesSection(section: PropertiesSectionDefinition): void;
    /**
     * Calls `callback` once, between frames, after at least `delay` milliseconds, and returns an
     * id for {@link clearTimer}. Timers stop when the plugin is turned off or reloads.
     *
     * Timer callbacks may edit the model inside `model.operation()`; an edit ends the gesture of
     * the active tool, as a command does. Callbacks must be synchronous; one that throws stops
     * its timer.
     */
    setTimeout(callback: () => unknown, delay?: number): number;
    /** Calls `callback` every `interval` milliseconds, at most once a frame, until {@link clearTimer}. */
    setInterval(callback: () => unknown, interval: number): number;
    /**
     * Calls `frame` once every frame, with the seconds since the animation started and since the
     * previous frame, until it returns `false` or {@link clearTimer} stops it.
     *
     * @example
     * ```js
     * // Shows a countdown in the status message for three seconds.
     * context.animate((elapsed) => {
     *   tool.status = `Done in ${Math.ceil(3 - elapsed)}s`;
     *   return elapsed < 3;
     * });
     * ```
     */
    animate(frame: (elapsed: number, delta: number) => unknown): number;
    /** Stops a timer or animation; ids of stopped ones are ignored. */
    clearTimer(id: number): void;
    /**
     * Draws over the viewport on every frame, whichever tool is selected, beneath the selected
     * tool's preview. `draw` describes the drawing with the same view as {@link ToolDefinition.draw},
     * in model coordinates, or in screen pixels with `screen: true`. It only reads the model, and
     * must be synchronous and quick, since it runs every frame. An overlay that throws is
     * removed, with a message; the plugin's other overlays keep drawing. Returns a function that
     * removes the overlay.
     *
     * @example
     * ```js
     * // Marks the origin with a red cross.
     * context.addOverlay((view) => {
     *   view.lines([[-0.5, 0, 0], [0.5, 0, 0], [0, -0.5, 0], [0, 0.5, 0]], { color: { r: 0.85, g: 0.2, b: 0.2 }, width: 2 });
     * });
     * ```
     */
    addOverlay(draw: (view: ToolView) => void): () => void;
    /**
     * Lets the pointer snap to targets the plugin gives, in every tool that snaps, with the
     * target's label in the tooltip. `provide` runs every frame, like an overlay, and returns
     * the targets in model coordinates. Named snaps such as endpoints, midpoints and
     * intersections always win. A provider that throws is removed, with a message. Returns a
     * function that removes the provider.
     *
     * @example
     * ```js
     * // Lets points snap to a height of 3 m, when seen from the side.
     * context.addSnapProvider(() => [{ plane: { point: [0, 0, 3], normal: [0, 0, 1] }, label: "Floor 1" }]);
     * ```
     */
    /**
     * Loads a PNG or JPEG file from the plugin folder, for overlays and previews to draw with
     * {@link ToolView.image}. A plugin's images may hold 64 million pixels together.
     */
    loadImage(path: string): PluginImage;
    /**
     * Makes an image from the bytes of a PNG or JPEG file, like {@link loadImage}, or from pixels:
     * four bytes of red, green, blue and alpha each, in rows from the top.
     *
     * @example
     * ```js
     * // A 2 by 1 image, red then half-transparent blue, saved as a PNG the user chooses.
     * const image = context.createImage({ width: 2, height: 1, pixels: new Uint8Array([255, 0, 0, 255, 0, 0, 255, 128]) });
     * const file = await context.files.save({ name: "swatch.png", filters: [{ name: "PNG image", extensions: ["png"] }] });
     * file?.writeBytes(image.toPng());
     * ```
     */
    createImage(source: Uint8Array | ArrayBuffer | { width: number; height: number; pixels: Uint8Array | ArrayBuffer }): PluginImage;
    /**
     * Lets the user select the plugin's own items, such as building levels, with the Select
     * tool, and delete them with Delete, like model entities. `items` runs every frame, like an
     * overlay, and returns each item's id and the lines and points the user picks it by, in
     * model coordinates; draw the items themselves with an overlay. Selected items show in the
     * selection's color. `onDelete` receives the ids of the deleted items inside one operation,
     * so storing the items in {@link documentData} makes deleting them undoable. Returns a
     * function that removes the items.
     *
     * @example
     * ```js
     * context.addPickableItems({
     *   items: () => marks.map((mark) => ({ id: mark.id, points: [mark.position] })),
     *   onDelete(ids) {
     *     marks = marks.filter((mark) => !ids.includes(mark.id));
     *     context.documentData.set(marks);
     *   },
     * });
     * ```
     */
    addPickableItems(definition: PickableItemsDefinition): () => void;
    /** File dialogs, the files the user picks in them, and the plugin's data folder. */
    readonly files: PluginFiles;
    /**
     * Sends a request to a host the plugin's `"network"` permission lists and the user granted,
     * and resolves with the response, or rejects with a `TypeError` when the request fails. Only
     * http and https URLs work, redirects come back as responses rather than being followed,
     * and a plugin may have 8 requests in flight. A command can `await` it: its run finishes
     * while the request is out, and continues once the response arrives. When another model
     * opens before the response arrives, the promise rejects with a `ReferenceError` instead,
     * and the code that runs for it, such as a `catch` or `finally`, can't reach the model open
     * now: reading or editing it throws a `ReferenceError` too. Restarting or turning
     * off the plugin cancels its requests. Desktop builds on Linux and macOS can make requests;
     * others throw.
     *
     * @example
     * ```js
     * const response = await context.fetch("https://api.example.com/prices?part=beam");
     * if (response.ok) {
     *   context.showMessage(`Beams cost ${response.json().price}`);
     * }
     * ```
     */
    fetch(url: string, options?: FetchOptions): Promise<FetchResponse>;
    /**
     * Adds File > Import `name`, which asks the user for a file with one of the `extensions` and
     * passes it to `import`, inside one undoable operation; dropping such a file on the window
     * imports it too. `import` must be synchronous, and needs no permission to read the file.
     * Modlumi keeps .modl and .skp to itself. When the plugin restarts or another model opens
     * before the import runs, it is dropped.
     *
     * @example
     * ```js
     * context.registerImporter({
     *   id: "points",
     *   name: "Point List",
     *   extensions: ["xyz"],
     *   import(file) {
     *     const points = file.readText().trim().split("\n").map((line) => line.split(/\s+/).map(Number));
     *     for (const point of points) modlumi.activeModel.activeEntities.addGuidePoint(point);
     *   },
     * });
     * ```
     */
    registerImporter(importer: ImporterDefinition): void;
    /**
     * Adds File > Export `name`, which asks the user where to save a file with one of the
     * `extensions` and passes it to `export`, which writes the model to it. `export` must be
     * synchronous, only reads the model, and needs no permission to write the file.
     */
    registerExporter(exporter: ExporterDefinition): void;
    /**
     * What the user granted of the permissions plugin.json asks for. Calls that need a
     * permission the plugin lacks throw an `Error` named `"PermissionError"`.
     */
    readonly permissions: PluginPermissions;
    /**
     * The parts of the plugin API added within its version that this Modlumi has, such as
     * `"network"` or `"mergeVertices"`. They depend on the build too: one that can't send
     * requests lacks `"network"`, whatever the user granted. A plugin that needs one lists it under `"requires"` in
     * plugin.json, so an older Modlumi refuses it with a clear reason; one that can do without
     * checks here.
     */
    readonly features: readonly PluginFeature[];
    /** The ids of the plugin's pickable items the user selected, in the order selected. */
    readonly selectedItems: readonly string[];
    addSnapProvider(provide: (viewport: Viewport) => Iterable<SnapTarget> | null | undefined): () => void;
  }

  /** Options of {@link PluginContext.fetch}. */
  interface FetchOptions {
    /** GET, HEAD, POST, PUT, PATCH, DELETE or OPTIONS; GET by default. */
    method?: string;
    /** Header names and values; Host, Content-Length and other connection headers are set by Modlumi. */
    headers?: Readonly<Record<string, string>>;
    body?: string | Uint8Array | ArrayBuffer;
  }

  /**
   * The response to {@link PluginContext.fetch}. Its body reads once, as text, JSON or bytes,
   * in the code that awaits the response; it isn't kept for later.
   */
  interface FetchResponse {
    readonly status: number;
    /** Whether the status is from 200 to 299. */
    readonly ok: boolean;
    readonly headers: {
      /** A header's value, its repeats joined with commas, or `null`; names ignore case. */
      get(name: string): string | null;
      has(name: string): boolean;
      /** Lowercase names and values. */
      entries(): [string, string][];
    };
    text(): string;
    json(): unknown;
    bytes(): Uint8Array;
  }

  /** A file format a plugin imports; see {@link PluginContext.registerImporter}. */
  interface ImporterDefinition {
    /** Identifies the format within the plugin. */
    id: string;
    /** Shown in the File menu and the file dialog, such as `"STL Model"`. */
    name: string;
    /** Without dots, such as `["stl"]`. */
    extensions: readonly string[];
    /** Reads the file into the model, in the context being edited. */
    import(file: PluginFile): void;
  }

  /** A file format a plugin exports; see {@link PluginContext.registerExporter}. */
  interface ExporterDefinition {
    id: string;
    name: string;
    extensions: readonly string[];
    /** Writes the model to the file. */
    export(file: PluginFile): void;
  }

  /** A kind of file a dialog offers, such as `{ name: "STL model", extensions: ["stl"] }`. */
  interface FileFilter {
    name: string;
    /** Without dots. */
    extensions: readonly string[];
  }

  /** Options of {@link PluginFiles.open} and {@link PluginFiles.save}. */
  interface FileDialogOptions {
    /** The dialog's title; "Open" or "Save" by default. */
    title?: string;
    /** The kinds of files it offers, the first chosen at first; any file without them. */
    filters?: readonly FileFilter[];
    /** Save dialogs: the suggested file name. */
    name?: string;
  }

  /**
   * A file the user chose in a file dialog. The plugin may read it, and write it when the user
   * chose it in a save dialog; it reaches no other file. Reads and writes are whole files, of
   * at most 256 MB.
   */
  interface PluginFile {
    /** The file's name, without its folder. */
    readonly name: string;
    /** Reads the file as UTF-8 text. */
    readText(): string;
    readBytes(): Uint8Array;
    /** Replaces the file's content; only for files chosen to save. */
    writeText(text: string): void;
    writeBytes(bytes: Uint8Array | ArrayBuffer): void;
  }

  /**
   * Files in the plugin's private data folder, which needs the `"files.pluginData"` permission.
   * Names are paths inside the folder, such as `"cache/parts.json"`. The folder holds at most
   * 1 GiB in 10,000 files and folders; a write that would go over throws a `RangeError`.
   */
  interface PluginDataFiles {
    /** Returns the file's text, or `null` when there is no such file. */
    readText(name: string): string | null;
    readBytes(name: string): Uint8Array | null;
    /** Creates or replaces a file, and the folders it is in. */
    writeText(name: string, text: string): void;
    writeBytes(name: string, bytes: Uint8Array | ArrayBuffer): void;
    /** Removes a file; returns whether there was one. */
    remove(name: string): boolean;
    /** The names of all the files, sorted. */
    list(): readonly string[];
  }

  /**
   * File dialogs, which need the `"files.dialog"` permission, and the plugin's data folder.
   *
   * @example
   * ```js
   * context.registerCommand({
   *   id: "export",
   *   title: "Export CSV",
   *   async run() {
   *     const file = await context.files.save({ name: "faces.csv", filters: [{ name: "CSV", extensions: ["csv"] }] });
   *     if (file) {
   *       file.writeText("kind,count\nface,12\n");
   *     }
   *   },
   * });
   * ```
   */
  interface PluginFiles {
    /**
     * Asks the user for a file to open, and resolves with it, or `null` when they cancel. The
     * dialog shows after the plugin's code for this frame; a command that awaits it finishes,
     * and continues once the user answers. When another model opens first, the promise rejects
     * with a `ReferenceError`, and the code that runs for it can't reach the model open now.
     */
    open(options?: FileDialogOptions): Promise<PluginFile | null>;
    /** Asks the user where to save, like {@link open}; the plugin may then write that file. */
    save(options?: FileDialogOptions): Promise<PluginFile | null>;
    readonly data: PluginDataFiles;
  }

  /** What a plugin may do beyond the model; see {@link PluginContext.permissions}. */
  interface PluginPermissions {
    /** `"files.dialog"`: show file dialogs, and read or write the files the user picks. */
    readonly filesDialog: boolean;
    /** `"files.pluginData"`: keep files in a private data folder of its own. */
    readonly pluginData: boolean;
    /** `"network"`: the hosts it may make requests to. */
    readonly network: readonly string[];
  }

  /** An item the Select tool picks; see {@link PluginContext.addPickableItems}. */
  interface PickableItem {
    /** Identifies the item among the plugin's items. */
    readonly id: string;
    /** Segments the user picks the item by, each from one point to another. */
    readonly lines?: Iterable<readonly [Point3dLike, Point3dLike]>;
    readonly points?: Iterable<Point3dLike>;
  }

  /** The items of {@link PluginContext.addPickableItems}. */
  interface PickableItemsDefinition {
    /** Returns the items, every frame. */
    items(viewport: Viewport): Iterable<PickableItem> | null | undefined;
    /** Removes the items with these ids, inside an operation; without it, the items can't be deleted. */
    onDelete?(ids: readonly string[]): void;
  }

  /**
   * A place the pointer snaps to, from {@link PluginContext.addSnapProvider}, in model
   * coordinates.
   *
   * - A `point` snaps like a midpoint does: before edges and faces, after endpoints,
   *   midpoints and intersections.
   * - A `line` through two points snaps like a guide line, along its length, or past its
   *   ends too with `infinite: true`.
   * - A `plane` moves the inferred point onto it when that moves it on screen by at most the
   *   snap aperture: along the line the point is on, such as an axis or an edge, or straight
   *   to the plane from a face or the ground. A plane seen almost face-on doesn't pull points
   *   off a line or face, since the move would only change their depth.
   */
  type SnapTarget = { readonly label?: string } & (
    | { readonly point: Point3dLike }
    | { readonly line: readonly [Point3dLike, Point3dLike]; readonly infinite?: boolean }
    | { readonly plane: { readonly point: Point3dLike; readonly normal: Vector3dLike } }
  );
}

/** Script output appears in the script console and the application log. */
interface Console {
  log(...values: unknown[]): void;
  info(...values: unknown[]): void;
  debug(...values: unknown[]): void;
  warn(...values: unknown[]): void;
  error(...values: unknown[]): void;
}
declare var console: Console;

interface ImportMeta {
  /** `file:` URL of the running module. */
  readonly url: string;
  /** `true` for the script that was run, `false` for modules it imports. */
  readonly main: boolean;
}
