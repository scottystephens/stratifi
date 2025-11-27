import { Navigation } from '@/components/navigation'

export const metadata = {
  title: 'Exchange Rates - Strategic Finance',
  description: 'Real-time USD to major currency exchange rates updated daily',
}

export default function RatesLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex h-screen">
      <Navigation />
      <main className="flex-1 overflow-y-auto bg-background">
        {children}
      </main>
    </div>
  )
}

