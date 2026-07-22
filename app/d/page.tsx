import dynamic from 'next/dynamic';

const FeatureD = dynamic(() => import('@/components/FeatureD'));

export default function PageD() {
  return (
    <main>
      <h1>Route /d</h1>
      <FeatureD />
    </main>
  );
}
