// The Office — floor plan geometry for the office fund (Malek's office).

// ============================================================
// Office fund — Malek's office only, flat top-down plan, in the same
// reference-image coordinates as FLOOR_PLAN above. Two areas hold the
// seven desks (2 in the Kitchen, 5 in the Desks area); Storage, the
// sink corner and the WC are drawn but greyed out. Desk ids must match
// _fund_desks() in finance.sql.
// ============================================================
const FUND_PLAN = {
  view: { x: 940, y: 92, w: 707, h: 961 },
  rooms: [
    { id: "kitchen", name: "Kitchen", x: 966, y: 118, w: 371, h: 342, active: true, lx: 990, ly: 166 },
    { id: "storage", name: "Storage", x: 1337, y: 118, w: 284, h: 342 },
    { id: "sink",    name: "Sink",    x: 1203, y: 330, w: 134, h: 130 },
    { id: "desks",   name: "Desks",   x: 1262, y: 460, w: 359, h: 567, active: true, lx: 1284, ly: 506 },
    { id: "wc",      name: "WC",      x: 1495, y: 460, w: 126, h: 212 },
  ],
  // same walls as FLOOR_PLAN's Malek section (south wall clipped to the office)
  walls: [
    { x1: 966, y1: 118, x2: 1621, y2: 118 },
    { x1: 1621, y1: 118, x2: 1621, y2: 1027 },
    { x1: 1621, y1: 1027, x2: 1262, y2: 1027, doorGap: [1400, 1480] },
    { x1: 966, y1: 118, x2: 966, y2: 460 },
    { x1: 1337, y1: 118, x2: 1337, y2: 460 },
    { x1: 966, y1: 460, x2: 1337, y2: 460, doorGap: [1120, 1197] },
    { x1: 1337, y1: 460, x2: 1621, y2: 460, doorGap: [1425, 1490] },
    { x1: 1262, y1: 460, x2: 1262, y2: 1027, doorGap: [945, 1015] },
    { x1: 1203, y1: 330, x2: 1203, y2: 460, doorGap: [370, 440] },
    { x1: 1203, y1: 330, x2: 1337, y2: 330 },
    { x1: 1495, y1: 460, x2: 1495, y2: 672, doorGap: [560, 640] },
    { x1: 1495, y1: 672, x2: 1621, y2: 672 },
  ],
  desks: [
    { id: "k1", area: "kitchen", label: "Kitchen 1", x: 990,  y: 196, w: 150, h: 104 },
    { id: "k2", area: "kitchen", label: "Kitchen 2", x: 1162, y: 196, w: 150, h: 104 },
    { id: "d1", area: "desks",   label: "Desk 1",    x: 1284, y: 530, w: 150, h: 104 },
    { id: "d2", area: "desks",   label: "Desk 2",    x: 1284, y: 668, w: 150, h: 104 },
    { id: "d3", area: "desks",   label: "Desk 3",    x: 1452, y: 706, w: 150, h: 104 },
    { id: "d4", area: "desks",   label: "Desk 4",    x: 1284, y: 840, w: 150, h: 104 },
    { id: "d5", area: "desks",   label: "Desk 5",    x: 1452, y: 840, w: 150, h: 104 },
  ],
};
