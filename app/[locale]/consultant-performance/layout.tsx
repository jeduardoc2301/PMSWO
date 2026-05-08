import { MainNavWrapper } from '@/components/navigation/main-nav-wrapper'

export default function ConsultantPerformanceLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-[#09090b]">
      <MainNavWrapper />
      <main className="flex-1 ml-64">
        {children}
      </main>
    </div>
  )
}
