import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.kisem.zerodegree',
  appName: 'Zero Degree',
  webDir: 'out',
  server: {
    androidScheme: 'https',
    allowNavigation: ['*.vercel.app'],
    cleartext: true,
  },
  android: {
    allowMixedContent: true,
  },
};

export default config;
