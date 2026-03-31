/**
 * Root layout for the application
 * This minimal layout is required by Next.js for the root redirect page
 * All actual layout logic is in app/[locale]/layout.tsx
 */
export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
