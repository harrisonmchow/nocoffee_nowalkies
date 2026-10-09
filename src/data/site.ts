export const site = {
  name: 'No Coffee No Walkies',
  email: 'nocoffeenowalkies@gmail.com',
  instagram: 'https://www.instagram.com/nocoffee_nowalkies/',
  handle: '@nocoffee_nowalkies',
};

// Bios are an open decision. Leave `line` empty until each person writes one.
// `id` is how walks and gear refer to each person.
export const crewIds = ['harry', 'kevin', 'caleb', 'mikey'] as const;
export type CrewId = (typeof crewIds)[number];

export const crew: { id: CrewId; name: string; line: string }[] = [
  { id: 'harry', name: 'Harry', line: '' },
  { id: 'kevin', name: 'Kevin', line: '' },
  { id: 'caleb', name: 'Caleb', line: '' },
  { id: 'mikey', name: 'Mikey', line: '' },
];

export const crewName = (id: string) => crew.find((c) => c.id === id)?.name ?? id;

// Brand work. Real collaborations exist but are not supplied yet.
// Add entries like:
// { brand: 'Brand name', title: 'What we made', region: 'tasmania',
//   deliverables: ['12 photos', '3 reels'], year: 2025, image: ... }
export type WorkItem = {
  brand: string;
  title: string;
  region: string;
  deliverables: string[];
  year: number;
};
export const work: WorkItem[] = [];
