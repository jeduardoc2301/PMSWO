import type { NextConfig } from 'next'
import createNextIntlPlugin from 'next-intl/plugin'

const withNextIntl = createNextIntlPlugin('./i18n/request.ts')

const nextConfig: NextConfig = {
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },
  env: {
    NEXTAUTH_URL: process.env.NEXTAUTH_URL ?? process.env.AUTH_URL ?? '',
    NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET ?? process.env.AUTH_SECRET ?? '',
    AUTH_SECRET: process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET ?? '',
    AUTH_URL: process.env.AUTH_URL ?? process.env.NEXTAUTH_URL ?? '',
    DATABASE_URL: process.env.DATABASE_URL ?? '',
    AWS_REGION: process.env.APP_AWS_REGION ?? process.env.AWS_REGION ?? 'us-east-1',
    AWS_ACCESS_KEY_ID: process.env.APP_AWS_ACCESS_KEY_ID ?? process.env.AWS_ACCESS_KEY_ID ?? '',
    AWS_SECRET_ACCESS_KEY: process.env.APP_AWS_SECRET_ACCESS_KEY ?? process.env.AWS_SECRET_ACCESS_KEY ?? '',
    APP_AWS_ACCESS_KEY_ID: process.env.APP_AWS_ACCESS_KEY_ID ?? '',
    APP_AWS_SECRET_ACCESS_KEY: process.env.APP_AWS_SECRET_ACCESS_KEY ?? '',
    APP_AWS_REGION: process.env.APP_AWS_REGION ?? 'us-east-1',
    S3_AVATAR_BUCKET: process.env.S3_AVATAR_BUCKET ?? '',
    S3_AVATAR_REGION: process.env.S3_AVATAR_REGION ?? 'us-east-1',
    S3_BUCKET_NAME: process.env.S3_BUCKET_NAME ?? '',

    // Reporte diario por correo.
    //
    // Van aquí y no solo en la consola de Amplify porque esta lista ES el mecanismo: Amplify
    // entrega sus variables al BUILD, no al runtime SSR, y lo que las hace visibles en
    // producción es que Next las incruste desde aquí. Una variable que no esté en esta lista
    // llega como `undefined` a un route handler aunque en la consola se vea puesta —que es
    // exactamente lo que pasó la primera vez: el endpoint contestaba 503 «no configurado» con
    // `CRON_SECRET` bien puesta en Amplify.
    //
    // Solo se leen desde código de servidor, así que no acaban en el bundle del navegador.
    CRON_SECRET: process.env.CRON_SECRET ?? '',
    SES_FROM_ADDRESS: process.env.SES_FROM_ADDRESS ?? '',
    SES_FROM_NAME: process.env.SES_FROM_NAME ?? '',
    SES_REPLY_TO: process.env.SES_REPLY_TO ?? '',
    SES_CONFIGURATION_SET: process.env.SES_CONFIGURATION_SET ?? '',
    SES_REGION: process.env.SES_REGION ?? process.env.APP_AWS_REGION ?? 'us-east-1',
    ALERT_EMAIL: process.env.ALERT_EMAIL ?? '',
    APP_PUBLIC_URL: process.env.APP_PUBLIC_URL ?? '',
    REPORTE_NARRATIVA_TIMEOUT_MS: process.env.REPORTE_NARRATIVA_TIMEOUT_MS ?? '',
  },
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
    // Keep console.error in production for server-side error visibility in Amplify/CloudWatch
    removeConsole: process.env.NODE_ENV === 'production' ? { exclude: ['error'] } : false,
  },

  // Experimental features para mejor performance
  experimental: {
    optimizePackageImports: ['@radix-ui/react-icons', 'lucide-react'],
  },
}

export default withNextIntl(nextConfig)
