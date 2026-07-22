import dynamic from 'next/dynamic';

const FeatureC = dynamic(() => import('@/components/FeatureC'));

export default function PageC() {
  return (
    <main>
      <h1>Route /c</h1>
      <FeatureC />
    </main>
  );
}
