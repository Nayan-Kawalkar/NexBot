/**
 * The three projects.
 *
 * Everything the interface shows for a vehicle — copy, framing, the word that
 * sits behind it — lives here, so switching projects is a single index change
 * and no component ever needs to know which vehicle it is drawing.
 *
 * `presentation` describes how the model should be staged rather than how it
 * was authored: the loader measures each GLB and normalises scale, centre and
 * ground contact, then applies these per-vehicle refinements on top.
 */
export const VEHICLES = [
  {
    id: 'pal',
    index: 0,
    name: 'Pal',
    year: '2021',
    title: 'A smarter last mile',
    statement: 'We believe the future is autonomous and sustainable',
    description:
      'Pal is a near-future prototype for an intelligent, modular personal transport system that embraces AI and machine learning to offer flexible and convenient “last mile” travel for Chinese electric vehicle company NIO.',
    secondary:
      'Various accessories — bag, basket, shopping cart — can be affixed to the front of Pal to cater to the user’s diverse and changing needs.',
    model: '/models/pal.glb',
    media: '/media/pal.webp',
    media2x: '/media/pal@2x.webp',
    mediaLabel: 'Play the Pal design film',
    presentation: {
      /* Share of the viewport height the vehicle should occupy. */
      fill: 0.8,
      /* Yaw that turns the authored front towards a front three-quarter view. */
      yaw: -0.62,
      /* Fine vertical nudge, in multiples of the vehicle height. */
      lift: 0,
      /* Relative width of the word set behind the model. */
      typeScale: 1,
    },
  },
  {
    id: 'sola',
    index: 1,
    name: 'Sola',
    year: '2023',
    title: 'The city, seated',
    statement: 'We believe mobility should adapt to the rider',
    description:
      'Sola carries the platform to riders who would rather sit than stand. A single-seat, three-wheel chassis leans into corners under its own control, keeping the seat level while the frame does the work of balance.',
    secondary:
      'Headrest, armrests and deck form one soft-goods system — swapped, washed or replaced without ever touching the structure beneath.',
    model: '/models/sola.glb',
    media: '/media/sola.webp',
    media2x: '/media/sola@2x.webp',
    mediaLabel: 'Play the Sola design film',
    presentation: {
      fill: 0.82,
      yaw: -0.62,
      lift: 0,
      typeScale: 0.78,
    },
  },
  {
    id: 'halo',
    index: 2,
    name: 'Halo',
    year: '2024',
    title: 'A roof, not a car',
    statement: 'We believe shelter should not cost a lane',
    description:
      'Halo closes the distance between a scooter and a car. One moulded canopy carries the glazing, the lighting and the roll structure, giving a single rider weather protection inside half the width of a city parking bay.',
    secondary:
      'Autonomy is optional rather than assumed — the yoke folds away into the dash, and the cabin hands itself over for the length of the journey.',
    model: '/models/halo.glb',
    media: '/media/halo.webp',
    media2x: '/media/halo@2x.webp',
    mediaLabel: 'Play the Halo design film',
    presentation: {
      // The widest of the three: a touch smaller so its rear wheel keeps clear
      // of the right-hand column.
      fill: 0.7,
      yaw: -0.62,
      lift: 0,
      typeScale: 0.78,
    },
  },
];

export const VEHICLE_COUNT = VEHICLES.length;

/** Zero-padded project number, as shown in the counter and the menu. */
export const projectNumber = (index) => String(index + 1).padStart(2, '0');
