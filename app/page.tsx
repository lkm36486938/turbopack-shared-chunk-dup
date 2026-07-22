import Link from 'next/link';

export default function Home() {
  return (
    <main>
      <h1>Shared chunk duplication repro</h1>
      <ul>
        <li><Link href="/a">/a</Link></li>
        <li><Link href="/b">/b</Link></li>
        <li><Link href="/c">/c</Link></li>
        <li><Link href="/d">/d</Link></li>
      </ul>
    </main>
  );
}
