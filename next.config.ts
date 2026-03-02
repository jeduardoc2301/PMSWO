import type { NextConfig } from 'next'
import createNextIntlPlugin from 'next-intl/plugin'

const withNextIntl = createNextIntlPlugin('./i18n/request.ts')

const nextConfig: NextConfig = {
  // Optimización de imágenes
  images: {
    formats: ['image/avif', 'image/webp'],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
    // Agregar dominios externos si es necesario
    remotePatterns: [
      // Ejemplo: si usamos imágenes de S3
      // {
      //   protocol: 'https',
      //   hostname: '**.amazonaws.com',
      // },
    ],
  },

  // Optimización de producción
  compiler: {
    removeConsole: process.env.NODE_ENV === 'production',
  },

  // Experimental features para mejor performance
  experimental: {
    optimizePackageImports: ['@radix-ui/react-icons', 'lucide-react'],
  },
}

export default withNextIntl(nextConfig)
