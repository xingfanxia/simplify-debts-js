import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.xingfanxia.settle',
  appName: 'Settle',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
  plugins: {
    SystemBars: {
      // Older Android WebViews can try to inject these variables before the
      // document exists. The app already handles insets with CSS env().
      insetsHandling: 'disable',
    },
  },
}

export default config
