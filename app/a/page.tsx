import dynamic from 'next/dynamic';

const FeatureA = dynamic(() => import('@/components/FeatureA'));

export default function PageA() {
  return (
    <main>
      <h1>Route /a</h1>
      <FeatureA />
    </main>
  );
}
