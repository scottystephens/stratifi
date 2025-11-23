import type { Metadata } from "next"
import { Inter } from "next/font/google"
import "./globals.css"
import { AuthProvider } from "@/lib/auth-context"
import { TenantProvider } from "@/lib/tenant-context"
import { ReactQueryProvider } from "@/lib/react-query-provider"
import { Toaster } from "sonner"

const inter = Inter({ subsets: ["latin"] })

export const metadata: Metadata = {
  title: "Stratifi - Strategic Financial Intelligence",
  description: "Multi-tenant treasury management platform with intelligent data ingestion, account management, and real-time financial insights",
  keywords: ["treasury management", "financial intelligence", "cash management", "multi-tenant", "data ingestion", "bank reconciliation"],
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body className={inter.className}>
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

