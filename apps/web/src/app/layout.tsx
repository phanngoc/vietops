import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'VietOps — IT Service Management',
  description: 'Enterprise ITSM platform for Vietnamese IT outsourcing companies',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi">
      <body className="min-h-screen bg-gray-50 text-gray-900 antialiased">{children}</body>
    </html>
  )
}
