import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SplashScreen } from '@capacitor/splash-screen'
import './index.css'
import App from './App.tsx'
import { initTheme } from "./lib/theme"

function shouldRetryQuery(failureCount: number, error: unknown): boolean {
  const message = (error instanceof Error ? error.message : String(error || "")).toLowerCase();

  if (
    message.includes("not authenticated") ||
    message.includes("invalid or expired token") ||
    message.includes("forbidden") ||
    message.includes("returned html instead of json")
  ) {
    return false;
  }

  return failureCount < 1;
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: shouldRetryQuery,
      refetchOnWindowFocus: false,
    },
  },
})

initTheme()
void SplashScreen.hide()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
)
