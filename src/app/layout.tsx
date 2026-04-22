import type { Metadata } from "next"
import "./globals.css"

export const metadata: Metadata = {
  title: "모인 견적 모니터링",
  description: "해외송금 경쟁사 최종 수취 금액 비교 · 내부 전용",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body className="bg-gray-50 min-h-screen">{children}</body>
    </html>
  )
}
