// ═══════════════════════════════════════════════
// MOCK DATA — matches Google Sheet Invoices schema
// Replace with Supabase queries in production
// ═══════════════════════════════════════════════

export const invoices = [
  { id: 19001, client: 'Buco Cash',       date: '2026-05-28', items: '3x 6m³ Skip',                    hire: 'Weekly',  payment: 'EFT',     amount: 1350, banked: 1350, vehicle: 'Trok 1',   driver: 'Joe',    collected: true  },
  { id: 19002, client: 'Euro Sales',      date: '2026-05-26', items: '2x 6m³ Skip, 1x 2m³ Skip, 1x 3m³ Skip', hire: 'Monthly', payment: 'Account', amount: 1600, banked: 0,    vehicle: 'Trok 2',   driver: 'Tsepho', collected: false },
  { id: 19003, client: 'Shelly Park',     date: '2026-05-22', items: '4x 6m³ Skip, 2x 2m³ Skip',       hire: 'Weekly',  payment: 'Card',    amount: 2700, banked: 2700, vehicle: 'Trok 1',   driver: 'Joe',    collected: true  },
  { id: 19004, client: 'Willie EFT',      date: '2026-05-18', items: '5x 6m³ Skip',                    hire: 'Weekly',  payment: 'EFT',     amount: 2250, banked: 2250, vehicle: 'Trok 3',   driver: 'Kagiso', collected: true  },
  { id: 19005, client: 'Eloftus Lodge',   date: '2026-04-28', items: '2x 6m³ Skip, 1x 9m³ Skip',       hire: 'Monthly', payment: 'Account', amount: 1200, banked: 0,    vehicle: 'Trok 4',   driver: 'James',  collected: false },
  { id: 19006, client: 'Lesego Builds',   date: '2026-04-15', items: '1x 6m³ Skip, 2x 3m³ Skip',       hire: 'Daily',   payment: 'Cash',    amount: 850,  banked: 850,  vehicle: 'Bakkie 1', driver: 'Oom WP', collected: true  },
  { id: 19007, client: 'Jaco EFT',        date: '2026-04-10', items: '3x 6m³ Skip, 1x 2m³ Skip',       hire: 'Weekly',  payment: 'EFT',     amount: 1800, banked: 1800, vehicle: 'Trok 2',   driver: 'Tsepho', collected: true  },
  { id: 19008, client: 'Pink Rocks',      date: '2026-03-20', items: '6x 6m³ Skip',                    hire: 'Monthly', payment: 'Account', amount: 2700, banked: 2700, vehicle: 'Trok 1',   driver: 'Joe',    collected: true  },
  { id: 19009, client: 'Air Products',    date: '2026-03-15', items: '2x 6m³ Skip, 2x 2m³ Skip',       hire: 'Weekly',  payment: 'EFT',     amount: 1800, banked: 1800, vehicle: 'Bakkie 2', driver: 'Bennie', collected: true  },
  { id: 19010, client: 'RHS Hoer Skool',  date: '2026-02-20', items: '1x 6m³ Skip, 1x 3m³ Skip',       hire: 'Daily',   payment: 'Cash',    amount: 700,  banked: 700,  vehicle: 'Bakkie 1', driver: 'Oom WP', collected: true  },
  { id: 18990, client: 'Buco Cash',       date: '2026-01-15', items: '3x 6m³ Skip',                    hire: 'Weekly',  payment: 'EFT',     amount: 1350, banked: 1350, vehicle: 'Trok 1',   driver: 'Joe',    collected: true  },
  { id: 18980, client: 'Brigadoon',       date: '2025-12-10', items: '2x 6m³ Skip, 1x 9m³ Skip',       hire: 'Monthly', payment: 'Account', amount: 1200, banked: 900,  vehicle: 'Trok 3',   driver: 'Kagiso', collected: true  },
  { id: 18960, client: 'Euro Sales',      date: '2025-11-20', items: '4x 6m³ Skip',                    hire: 'Monthly', payment: 'EFT',     amount: 1800, banked: 1800, vehicle: 'Trok 2',   driver: 'Tsepho', collected: true  },
  { id: 18940, client: 'Willie EFT',      date: '2025-10-15', items: '3x 6m³ Skip, 1x 2m³ Skip',       hire: 'Weekly',  payment: 'EFT',     amount: 1800, banked: 1800, vehicle: 'Trok 3',   driver: 'Kagiso', collected: true  },
  { id: 18920, client: 'Crane Corp',      date: '2025-09-20', items: '8x 6m³ Skip, 2x 9m³ Skip',       hire: 'Monthly', payment: 'Account', amount: 4200, banked: 4200, vehicle: 'Trok 4',   driver: 'James',  collected: true  },
  { id: 18900, client: 'Shelly Park',     date: '2025-08-14', items: '3x 6m³ Skip, 2x 2m³ Skip',       hire: 'Weekly',  payment: 'Card',    amount: 2250, banked: 2250, vehicle: 'Trok 1',   driver: 'Joe',    collected: true  },
  { id: 18880, client: 'Concept Mining',  date: '2025-07-10', items: '10x 6m³ Skip',                   hire: 'Monthly', payment: 'Account', amount: 4500, banked: 4500, vehicle: 'Trok 2',   driver: 'Tsepho', collected: true  },
  { id: 18860, client: 'Jaco EFT',        date: '2025-06-15', items: '3x 6m³ Skip',                    hire: 'Weekly',  payment: 'EFT',     amount: 1350, banked: 1350, vehicle: 'Trok 3',   driver: 'Kagiso', collected: true  },
  { id: 18840, client: 'Eloftus Lodge',   date: '2026-04-01', items: '2x 6m³ Skip',                    hire: 'Monthly', payment: 'Account', amount: 900,  banked: 0,    vehicle: 'Trok 4',   driver: 'James',  collected: false },
  { id: 18820, client: 'Brigadoon',       date: '2026-02-14', items: '1x 6m³ Skip, 1x 2m³ Skip',       hire: 'Weekly',  payment: 'Account', amount: 750,  banked: 0,    vehicle: 'Bakkie 2', driver: 'Bennie', collected: false },
];

export const skipFleet = {
  s2: { label: '2m³', total: 8,  color: '#4A90D9' },
  s3: { label: '3m³', total: 6,  color: '#9B7FE8' },
  s6: { label: '6m³', total: 20, color: '#C97010' },
  s9: { label: '9m³', total: 4,  color: '#2ECC8A' },
};

export const fleet = [
  { name: 'Trok 1',   driver: 'Joe',    type: 'Fuso',     util: 78 },
  { name: 'Trok 2',   driver: 'Tsepho', type: 'Hino',     util: 65 },
  { name: 'Trok 3',   driver: 'Kagiso', type: 'MAN',      util: 71 },
  { name: 'Trok 4',   driver: 'James',  type: 'Fuso',     util: 58 },
  { name: 'Bakkie 1', driver: 'Oom WP', type: 'Mahindra', util: 82 },
  { name: 'Bakkie 2', driver: 'Bennie', type: 'Mahindra', util: 55 },
];

export const costs = { Daily: 320, Weekly: 480, Monthly: 600, Weekend: 360 };

export const seasonal = {
  Jan: 88, Feb: 82, Mar: 95, Apr: 102, May: 112, Jun: 78,
  Jul: 72, Aug: 80, Sep: 98, Oct: 108, Nov: 118, Dec: 105,
};

export const markov = { Depot: 38.2, Outbound: 8.4, OnSite: 44.1, Return: 6.8, OutOfService: 2.5 };
export const customerStates = { Active: 14, Loyal: 8, New: 5, Lapsed: 11, Inactive: 19 };
