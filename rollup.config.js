import resolve from '@rollup/plugin-node-resolve';
import { readFileSync } from 'fs';

// Read the userscript header from the source
const banner = readFileSync('./src/banner.txt', 'utf-8');

export default {
  input: 'src/main.js',
  output: {
    file: 'dist/headlines-neutralizer.js',
    format: 'iife',
    banner: banner,
    strict: true
  },
  plugins: [
    resolve()
  ]
};
