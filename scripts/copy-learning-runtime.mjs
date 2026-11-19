import { cpSync, mkdirSync } from 'node:fs';
mkdirSync('dist/server/learning', { recursive: true });
cpSync('src/server/learning/legacy', 'dist/server/learning/legacy', { recursive: true });
