// Bundled program valuations, backed by data/catalog.curated.json.

import curated from '../../../data/catalog.curated.json';
import type { ProgramSeed } from '../types';

export const programs = curated.programs as ProgramSeed[];
