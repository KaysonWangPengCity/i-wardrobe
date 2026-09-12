import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useEffect } from 'react'
import { BottomNav } from '@/components/BottomNav'
import { ModalProvider } from '@/components/ui/Modal'
import { ToastProvider } from '@/components/ui/Toast'
import { ImagePreviewProvider } from '@/components/ui/ImagePreview'
import { useAppStore } from '@/store/app'
import TodayPage from '@/pages/Today'
import WardrobePage from '@/pages/Wardrobe'
import CapturePage from '@/pages/Capture'
import HistoryPage from '@/pages/History'
import SettingsPage from '@/pages/Settings'

export default function App() {
  const { init, ready } = useAppStore()

  useEffect(() => {
    init()
  }, [init])

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">
        加载中...
      </div>
    )
  }

  return (
    <ModalProvider>
      <ToastProvider>
        <ImagePreviewProvider>
          <BrowserRouter>
            <div className="min-h-screen bg-background text-foreground">
              <Routes>
                <Route path="/" element={<TodayPage />} />
                <Route path="/wardrobe" element={<WardrobePage />} />
                <Route path="/capture" element={<CapturePage />} />
                <Route path="/history" element={<HistoryPage />} />
                <Route path="/settings" element={<SettingsPage />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
              <BottomNav />
            </div>
          </BrowserRouter>
        </ImagePreviewProvider>
      </ToastProvider>
    </ModalProvider>
  )
}
