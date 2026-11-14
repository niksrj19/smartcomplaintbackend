/**
 * Seeds the sample department list. Safe to run more than once (upserts by code).
 * Embeddings are NOT created here — the app generates them on its next startup.
 *
 * Run:  npx prisma db seed
 */
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

const departments = [
  {
    code: 'ROADS',
    name: 'Roads & Public Works',
    description:
      'Potholes, damaged or broken roads, cracked footpaths and pavements, road cave-ins, missing manhole covers on roads, damaged speed breakers, unfinished road construction and debris left on roads.',
    contactEmail: 'roads@smartcity.example',
  },
  {
    code: 'WATER',
    name: 'Water Supply',
    description:
      'No water supply, low water pressure, dirty or contaminated tap water, burst or leaking water pipelines, illegal water connections, broken public taps and water tanker requests.',
    contactEmail: 'water@smartcity.example',
  },
  {
    code: 'SEWERAGE',
    name: 'Drainage & Sewerage',
    description:
      'Overflowing or blocked sewers and drains, open manholes, sewage leaking onto streets, waterlogging after rain, foul smell from drains and damaged storm water drains.',
    contactEmail: 'sewerage@smartcity.example',
  },
  {
    code: 'ELECTRICITY',
    name: 'Street Lighting & Electricity',
    description:
      'Street lights not working or flickering, exposed or hanging live electric wires, sparking electricity poles, damaged transformers, fallen electric poles and lights left on during the day.',
    contactEmail: 'electricity@smartcity.example',
  },
  {
    code: 'SANITATION',
    name: 'Garbage & Sanitation',
    description:
      'Garbage not collected, overflowing dustbins, garbage dumped on roads or empty plots, burning of waste, dead animals on roads, dirty public toilets and street sweeping not done.',
    contactEmail: 'sanitation@smartcity.example',
  },
  {
    code: 'TRAFFIC',
    name: 'Traffic & Signals',
    description:
      'Traffic signals not working, missing or damaged road signs, faded zebra crossings and road markings, illegal parking blocking roads, regular traffic jams and broken traffic barriers.',
    contactEmail: 'traffic@smartcity.example',
  },
  {
    code: 'PARKS',
    name: 'Parks & Trees',
    description:
      'Fallen or dangerous trees, overgrown branches touching wires, poorly maintained public parks, broken benches and play equipment, illegal tree cutting and unkempt green belts.',
    contactEmail: 'parks@smartcity.example',
  },
  {
    code: 'ANIMAL_CONTROL',
    name: 'Stray Animal Control',
    description:
      'Aggressive or injured stray dogs, stray cattle on roads, animal bites, monkey menace, requests for animal sterilisation and rescue of trapped or injured animals.',
    contactEmail: 'animals@smartcity.example',
  },
  {
    code: 'ENCROACHMENT',
    name: 'Building & Encroachment',
    description:
      'Illegal construction, encroachment on footpaths or roads by shops and vendors, unsafe or dilapidated buildings, construction without permission and blocked public spaces.',
    contactEmail: 'encroachment@smartcity.example',
  },
  {
    code: 'PUBLIC_HEALTH',
    name: 'Public Health & Pollution',
    description:
      'Mosquito breeding and stagnant water, need for fogging or pest control, air pollution from smoke or dust, noise pollution, unhygienic food stalls and industrial waste dumping.',
    contactEmail: 'health@smartcity.example',
  },
];

async function main() {
  for (const d of departments) {
    await prisma.department.upsert({
      where: { code: d.code },
      update: { name: d.name, description: d.description, contactEmail: d.contactEmail },
      create: d,
    });
  }
  console.log(`Seeded ${departments.length} departments`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
