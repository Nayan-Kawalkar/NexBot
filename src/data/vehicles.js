/**
 * The four projects.
 *
 * Everything the interface shows for a robot — copy, framing, the word that
 * sits behind it — lives here, so switching projects is a single index change
 * and no component ever needs to know which one it is drawing.
 *
 * `presentation` describes how the model should be staged rather than how it
 * was authored: the loader measures each GLB and normalises scale, centre and
 * ground contact, then applies these per-vehicle refinements on top.
 *
 * `atmosphere` grades the room to the robot standing in it. The gradient
 * itself never changes shape — these colours simply replace the `--atm-*`
 * tokens it is drawn from, and each set is derived from that model's own
 * dominant albedo held at the lightness of the original slate, so contrast
 * against the copy is unaffected.
 */
export const VEHICLES = [
  {
    id: 'kodo',
    index: 0,
    name: 'Kodo',
    year: '2022',
    title: 'A body built for stairs',
    statement:
      'We believe a machine should meet the world where it is',
    description:
      'Kodo is a four-legged carrier that stops arguing about wheels versus legs. Each limb ends in a driven wheel, so it rolls where the floor is flat and walks where it is not — a warehouse aisle and a flight of stairs on the same errand.',
    secondary:
      'Its back is a flat deck rather than a shell: crates, tools, a stretcher or a survey rig bolt straight on, and the gait re-balances itself around whatever it is carrying.',
    model: '/models/kodo.glb',
    media: '/media/kodo.webp',
    media2x: '/media/kodo@2x.webp',
    mediaLabel: 'Play the Kodo field film',
    /* Sampled dominant albedo #292c30 — a cool near-neutral, which is the
       grade the studio was authored in, so Kodo keeps the base palette. */
    atmosphere: {
      glow: [133, 148, 163],
      stops: ['#3c454e', '#414a53', '#3a424b', '#313841'],
      deep: '#2f363e',
    },
    presentation: {
      /* Share of the viewport height the vehicle should occupy. */
      fill: 0.8,
      /* Yaw that turns the authored front towards a front three-quarter view,
         set a little past three-quarters so the nose reads to the left. */
      yaw: -0.78,
      /* Fine vertical nudge, in multiples of the vehicle height. */
      lift: 0,
      /* Relative width of the word set behind the model. */
      typeScale: 1,
    },
  },
  {
    id: 'vero',
    index: 1,
    name: 'Vero',
    year: '2023',
    title: 'Hands, where they are needed',
    statement:
      'We believe autonomy should be able to lend a hand',
    description:
      'Vero is a general-purpose humanoid, sized to the spaces people already work in. It reaches the same shelves, passes through the same doorways and uses the same tools, so a site never has to be rebuilt around it.',
    secondary:
      'The visor is the whole interface: perception, intent and attention are shown on one surface, so anyone nearby can read what it is about to do without a screen or an app.',
    model: '/models/vero.glb',
    media: '/media/vero.webp',
    media2x: '/media/vero@2x.webp',
    mediaLabel: 'Play the Vero field film',
    /* Sampled dominant albedo #7776ef — the violet body. */
    atmosphere: {
      glow: [148, 146, 190],
      stops: ['#43405a', '#484563', '#413e57', '#37344a'],
      deep: '#332f45',
    },
    presentation: {
      fill: 0.82,
      yaw: -1.12,
      lift: 0,
      typeScale: 0.78,
    },
  },
  {
    id: 'nia',
    index: 2,
    name: 'Nia',
    year: '2024',
    title: 'A helper that stays home',
    statement:
      'We believe care should feel like company',
    description:
      'Nia is the domestic member of the family: a stable wheeled base, a torso that raises and lowers, and two arms deliberately geared to be gentle. It works at counter height and at floor height without ever needing to be lifted.',
    secondary:
      'Nothing about it is hidden. The base carries its own weight low and slow, and every joint stops the moment it meets resistance it did not expect.',
    model: '/models/nia.glb',
    media: '/media/nia.webp',
    media2x: '/media/nia@2x.webp',
    mediaLabel: 'Play the Nia home film',
    /* Sampled dominant albedo #565049 — warm taupe bodywork. */
    atmosphere: {
      glow: [168, 157, 140],
      stops: ['#4b463d', '#514c42', '#49443c', '#3f3a33'],
      deep: '#3b372f',
    },
    presentation: {
      // The widest of the four: a touch smaller so its rear wheel keeps clear
      // of the right-hand column.
      fill: 0.7,
      yaw: -1.12,
      lift: 0,
      typeScale: 0.78,
    },
  },
  {
    id: 'lumi',
    index: 3,
    name: 'Lumi',
    year: '2025',
    title: 'Small, and entirely present',
    statement:
      'We believe the smallest robot should feel the most considered',
    description:
      'Lumi is the one you talk to. Knee-high and light enough to pick up, it is built for attention rather than payload — reading a room, holding a conversation, and knowing when to leave one alone.',
    secondary:
      'The ears are instruments, not decoration: they carry the microphone array and, in moving, tell you exactly where its attention has gone.',
    model: '/models/lumi.glb',
    media: '/media/lumi.webp',
    media2x: '/media/lumi@2x.webp',
    mediaLabel: 'Play the Lumi companion film',
    /* Sampled dominant albedo #b19694 — a soft rose, with the violet trim
       pulling the shadows slightly cool. */
    atmosphere: {
      glow: [176, 152, 155],
      stops: ['#4e4245', '#544749', '#4b4042', '#413739'],
      deep: '#3d3336',
    },
    presentation: {
      fill: 0.8,
      yaw: -1.12,
      lift: 0,
      typeScale: 0.9,
    },
  },
];

export const VEHICLE_COUNT = VEHICLES.length;

/** Zero-padded project number, as shown in the counter and the menu. */
export const projectNumber = (index) => String(index + 1).padStart(2, '0');
