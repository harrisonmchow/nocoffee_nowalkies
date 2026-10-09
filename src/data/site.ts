export const site = {
  name: 'No Coffee No Walkies',
  email: 'nocoffeenowalkies@gmail.com',
  instagram: 'https://www.instagram.com/nocoffee_nowalkies/',
  handle: '@nocoffee_nowalkies',
};

// Bios are an open decision. Leave `line` empty until each person writes one.
export const crew: { name: string; line: string }[] = [
  { name: 'Harry', line: '' },
  { name: 'Kevin', line: '' },
  { name: 'Caleb', line: '' },
  { name: 'Mikey', line: '' },
];

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
