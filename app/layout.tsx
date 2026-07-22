export const metadata = {
  title: 'turbopack-shared-chunk-dup',
  description: 'Reproduction: shared module duplicated across async chunks under Turbopack',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
