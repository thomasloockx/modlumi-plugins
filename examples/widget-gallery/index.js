// An example plugin: a panel that shows every widget, one tab per kind, with the values it
// keeps between draws.

/** @type {modlumi.Color} */
const kBlue = { r: 0.25, g: 0.45, b: 0.8, a: 1 };
/** @type {modlumi.Color} */
const kOrange = { r: 0.95, g: 0.55, b: 0.15, a: 1 };

const state = {
  name: "Shed",
  notes: "Timber frame on a concrete slab.",
  width: 2.4,
  height: 2.2,
  count: 6,
  ratio: 0.5,
  pitch: Math.PI / 9,
  opacity: 80,
  segments: 12,
  insulated: true,
  lights: false,
  roof: "Gable",
  cladding: "Boards",
  paint: { r: 0.42, g: 0.55, b: 0.36, a: 1 },
  /** @type {modlumi.Material | null} */
  roofing: null,
  /** @type {string | null} */
  part: "roof",
  /** @type {string | null} */
  material: null,
  /** @type {string[]} */
  parts: [],
  /** The nodes on the canvas, which the user drags around. */
  nodes: [
    { id: "slab", label: "Slab", x: 16, y: 20 },
    { id: "walls", label: "Walls", x: 120, y: 70 },
    { id: "roof", label: "Roof", x: 224, y: 20 },
  ],
};

/** @param {modlumi.Ui} ui */
function drawFields(ui) {
  state.name = ui.textField("Name", state.name, { hint: "Untitled" });
  state.notes = ui.textBox("Notes", state.notes, { lines: 2 });
  state.width = ui.length("Width", state.width, { min: 0.5, tip: "Type 8', 2.4m or 240cm" });
  state.height = ui.length("Height", state.height, { min: 0.5 });
  state.count = ui.integer("Rafters", state.count, { min: 2, max: 40 });
  state.ratio = ui.number("Overhang ratio", state.ratio, { min: 0, max: 1, decimals: 2 });
  state.pitch = ui.angle("Roof pitch", state.pitch, { min: 0, max: Math.PI / 3 });
  state.opacity = ui.slider("Opacity", state.opacity, { min: 0, max: 100, decimals: 0, suffix: "%" });
  state.segments = ui.slider("Segments", state.segments, { min: 3, max: 48, integer: true });
  ui.readOnly("Floor area", modlumi.activeModel.formatArea(state.width * state.width));
}

/** @param {modlumi.Ui} ui */
function drawChoices(ui) {
  state.insulated = ui.checkbox("Insulated", state.insulated);
  state.lights = ui.toggle("Lights", state.lights);
  state.roof = ui.radio("Roof", state.roof, ["Flat", "Gable", "Hip"]);
  state.cladding = ui.dropdown("Cladding", state.cladding, ["Boards", "Shingles", "Metal", "Render"]);
  state.paint = ui.color("Paint", state.paint);
  state.roofing = ui.material("Roofing", state.roofing?.isValid ? state.roofing : null);
  ui.row(() => {
    ui.button("Reset");
    ui.button("Build", { primary: true });
  });
}

/** A gradient from blue to orange, made when the plugin starts. @type {modlumi.PluginImage | null} */
let gradient = null;

/**
 * Makes a horizontal gradient of width by height pixels between two colors.
 * @param {modlumi.PluginContext} context
 */
function makeGradient(context, width = 64, height = 8) {
  const pixels = new Uint8Array(width * height * 4);
  for (let x = 0; x < width; ++x) {
    const t = x / (width - 1);
    for (let y = 0; y < height; ++y) {
      const at = (y * width + x) * 4;
      pixels[at] = Math.round(255 * (kBlue.r + t * (kOrange.r - kBlue.r)));
      pixels[at + 1] = Math.round(255 * (kBlue.g + t * (kOrange.g - kBlue.g)));
      pixels[at + 2] = Math.round(255 * (kBlue.b + t * (kOrange.b - kBlue.b)));
      pixels[at + 3] = 255;
    }
  }
  return context.createImage({ width, height, pixels });
}

/** @param {modlumi.Ui} ui */
function drawText(ui) {
  ui.heading("Heading");
  ui.text("Plain text wraps to the width of the window.");
  ui.text("Muted text", { tone: "muted" });
  ui.text("Success", { tone: "success" });
  ui.text("Warning", { tone: "warning" });
  ui.text("Error", { tone: "error" });
  ui.separator("Separator");
  ui.progress(0.4, { text: "Building rafters" });
  if (gradient !== null) {
    ui.image(gradient, { width: 240, height: 12 });
  }
  ui.section("Section", () => ui.text("Sections fold the widgets inside them."));
  ui.columns([() => ui.button("Left column"), () => ui.button("Right column")]);
  ui.disabled(true, () => ui.button("Disabled"));
}

/** @param {modlumi.Ui} ui */
function drawData(ui) {
  state.part = ui.tree(
    "Parts",
    [
      { id: "shed", label: "Shed", open: true, children: [
        { id: "walls", label: "Walls" },
        { id: "roof", label: "Roof", children: [{ id: "rafters", label: "Rafters" }] },
      ] },
      { id: "path", label: "Path" },
    ],
    state.part,
  );
  ui.spacing();
  const rows = [
    { id: "pine", cells: ["Pine", "12 m²", 3] },
    { id: "oak", cells: ["Oak", "4.5 m²", 1] },
    { id: "steel", cells: ["Steel", "20 m²", 2] },
  ];
  state.material = ui.table(
    "Materials",
    ["Material", { title: "Area", numeric: true }, { title: "Uses", numeric: true }],
    rows,
    state.material,
    { visibleRows: 3 },
  );
  ui.spacing();
  ui.canvas("Nodes", 120, (canvas, event) => {
    // Dragging a node moves it before this draw shows it.
    const dragged = state.nodes.find((node) => node.id === event?.item);
    if (event?.type === "drag" && dragged) {
      dragged.x += event.dx;
      dragged.y += event.dy;
    }
    const [slab, walls, roof] = state.nodes;
    canvas.line([[slab.x + 40, slab.y + 30], [walls.x + 40, walls.y]], { stroke: kOrange, width: 2 });
    canvas.line([[walls.x + 40, walls.y], [roof.x + 40, roof.y + 30]], { stroke: kOrange, width: 2 });
    for (const node of state.nodes) {
      canvas.rect(node.x, node.y, 80, 30, { id: node.id, fill: kBlue });
      canvas.text([node.x + 8, node.y + 6], node.label, { stroke: { r: 1, g: 1, b: 1, a: 1 } });
    }
  });
}

/** @param {modlumi.PluginContext} context */
export function activate(context) {
  gradient = makeGradient(context);
  const panel = context.addPanel({
    id: "gallery",
    title: "Widget Gallery",
    width: 380,
    height: 560,
    draw(ui) {
      ui.tabs({
        Fields: () => drawFields(ui),
        Choices: () => drawChoices(ui),
        Text: () => drawText(ui),
        Data: () => drawData(ui),
      });
    },
  });
  context.registerCommand({
    id: "open",
    title: "Widget Gallery",
    tip: "Shows every widget a plugin panel can use.",
    run: () => panel.show(),
  });
}
