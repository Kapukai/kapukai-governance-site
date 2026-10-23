import { readFile } from 'node:fs/promises';
import { evaluatePilot } from './workflow.mjs';
import { createFictionalPilot } from './example.mjs';

// Metadata review only. No network, persistence, uploads or provider mutation.
// Keep real input files outside this public source checkout.
const input = process.argv[2];
if (!input || process.argv.length !== 3) {
  process.stderr.write('Usage: node commercial-pilot/check.mjs <path-to-metadata.json|--demo>\n');
  process.exitCode = 2;
} else {
  try {
    const buffer = input === '--demo' ? Buffer.from(JSON.stringify(createFictionalPilot())) : await readFile(input);
    if (buffer.byteLength > 64 * 1024) throw new Error('Input exceeds metadata limit');
    const result = evaluatePilot(JSON.parse(buffer.toString('utf8')));
    process.stdout.write(`${JSON.stringify({ fictionalDemo: input === '--demo', ...result }, null, 2)}\n`);
    process.exitCode = result.blockers.length ? 1 : 0;
  } catch {
    // Do not echo raw input, private paths or document contents on errors.
    process.stderr.write('Could not check the metadata. Use a valid JSON record under 64 KiB.\n');
    process.exitCode = 2;
  }
}
