// Bundled sample program valuations; see cards.ts for the dataset note.

import sample from './sample-catalog.json';
import type { ProgramSeed } from '../types';

export const programs = (sample as { programs: ProgramSeed[] }).programs;
