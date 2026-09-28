const names = [
  'vite',
  '@vitejs/plugin-react',
  'three',
  '@react-three/fiber',
  'framer-motion',
  'gsap',
  'lucide-react',
  'react',
  'react-dom',
  'typescript',
  '@types/three',
  '@types/react',
  '@types/react-dom',
];

const registry = (await import('node:child_process')).execSync('npm config get registry').toString().trim();
console.log('registry =', registry);

for (const name of names) {
  try {
    const res = await fetch(`${registry.replace(/\/$/, '')}/${name.replace('/', '%2f')}`);
    if (!res.ok) {
      console.log(`${name}: HTTP ${res.status}`);
      continue;
    }
    const body = await res.json();
    const latest = body['dist-tags']?.latest;
    const versions = Object.keys(body.versions ?? {});
    const tail = versions.slice(-6).join(', ');
    console.log(`${name}: latest=${latest} | last6=[${tail}]`);
  } catch (error) {
    console.log(`${name}: ERROR ${error.message}`);
  }
}
