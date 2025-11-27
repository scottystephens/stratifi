import type { Metadata } from "next"
import { Inter } from "next/font/google"
import "./globals.css"
import { AuthProvider } from "@/lib/auth-context"
import { TenantProvider } from "@/lib/tenant-context"
import { ReactQueryProvider } from "@/lib/react-query-provider"
import { Toaster } from "sonner"

// Universal font - clean, readable, professional
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
})

export const metadata: Metadata = {
  title: "Strategic Finance Platform",
  description: "Connect to global banks with real-time cash visibility, analytics, and treasury intelligence.",
  keywords: ["treasury management", "cash management", "financial intelligence", "multi-currency", "bank connectivity", "cash forecasting"],
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="bg-stone-50">
        <ReactQueryProvider>
          <AuthProvider>
            <TenantProvider>
              {children}
              <Toaster position="bottom-right" richColors expand={true} />
            </TenantProvider>
          </AuthProvider>
        </ReactQueryProvider>
      </body>
    </html>
  )
}
