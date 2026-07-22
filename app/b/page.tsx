import dynamic from 'next/dynamic';

const FeatureB = dynamic(() => import('@/components/FeatureB'));

export default function PageB() {
  return (
    <main>
      <h1>Route /b</h1>
      <FeatureB />
    </main>
  );
}
