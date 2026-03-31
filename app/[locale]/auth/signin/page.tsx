'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { signIn } from 'next-auth/react'
import { useTranslations } from 'next-intl'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Eye, EyeOff } from 'lucide-react'

// Validation schema
const signInSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(1, 'Password is required'),
})

type SignInFormData = z.infer<typeof signInSchema>

export default function SignInPage() {
  const router = useRouter()
  const t = useTranslations()
  const [formData, setFormData] = useState<SignInFormData>({
    email: '',
    password: '',
  })
  const [errors, setErrors] = useState<Partial<Record<keyof SignInFormData, string>>>({})
  const [isLoading, setIsLoading] = useState(false)
  const [authError, setAuthError] = useState<string | null>(null)
  const [showPassword, setShowPassword] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrors({})
    setAuthError(null)
    setIsLoading(true)

    try {
      // Validate form data
      const validatedData = signInSchema.parse(formData)

      // Attempt sign in with NextAuth
      const result = await signIn('credentials', {
        email: validatedData.email,
        password: validatedData.password,
        redirect: false,
      })

      if (result?.error) {
        // Handle authentication errors
        setAuthError(t('auth.invalidCredentials'))
      } else if (result?.ok) {
        // Get session to determine redirect based on role
        const response = await fetch('/api/v1/auth/me')
        if (response.ok) {
          const { user } = await response.json()
          
          // Determine redirect URL based on user roles
          let redirectUrl = '/es/projects' // Default for most users
          
          // Check if user has DASHBOARD_EXECUTIVE permission (ADMIN or EXECUTIVE)
          if (user.roles.includes('ADMIN') || user.roles.includes('EXECUTIVE')) {
            redirectUrl = '/es/dashboard'
          }
          
          router.push(redirectUrl)
          router.refresh()
        } else {
          // Fallback to projects if we can't get user info
          router.push('/es/projects')
          router.refresh()
        }
      }
    } catch (error) {
      if (error instanceof z.ZodError) {
        // Handle validation errors
        const fieldErrors: Partial<Record<keyof SignInFormData, string>> = {}
        error.issues?.forEach((err) => {
          if (err.path[0]) {
            fieldErrors[err.path[0] as keyof SignInFormData] = err.message
          }
        })
        setErrors(fieldErrors)
      } else {
        // Handle unexpected errors
        setAuthError(t('errors.generic'))
      }
    } finally {
      setIsLoading(false)
    }
  }

  const handleChange = (field: keyof SignInFormData) => (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    setFormData((prev) => ({ ...prev, [field]: e.target.value }))
    // Clear field error when user starts typing
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: undefined }))
    }
    // Clear auth error when user starts typing
    if (authError) {
      setAuthError(null)
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden">
      {/* Background Image */}
      <div 
        className="absolute inset-0 z-0"
        style={{
          backgroundImage: 'url(/GettyImages-1369830956.jpg.jpeg)',
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
        }}
      >
        {/* Dark Overlay */}
        <div className="absolute inset-0 bg-black/70" />
      </div>

      {/* Content */}
      <div className="relative z-10 w-full max-w-md px-4">
        {/* Logo */}
        <div className="mb-8 flex justify-center">
          <img 
            src="/SoftwareOne_Logo_Sml_RGB_Rev.svg" 
            alt="SoftwareOne" 
            className="h-12 w-auto"
          />
        </div>

        {/* Sign In Card */}
        <div className="rounded-lg bg-white/95 backdrop-blur-sm p-8 shadow-2xl">
          <div className="mb-6">
            <h1 className="text-center text-2xl font-bold text-gray-900">
              {t('common.appName')}
            </h1>
            <h2 className="mt-2 text-center text-lg font-medium text-gray-800">
              {t('auth.signIn')}
            </h2>
          </div>

          <form className="space-y-6" onSubmit={handleSubmit}>
            {authError && (
              <div
                className="rounded-md bg-red-50 p-4 text-sm text-red-800"
                role="alert"
                aria-live="polite"
              >
                {authError}
              </div>
            )}

            <div className="space-y-4">
              <div>
                <Label htmlFor="email" className="block text-gray-900">
                  {t('auth.email')}
                </Label>
                <Input
                  id="email"
                  name="email"
                  type="text"
                  autoComplete="email"
                  value={formData.email}
                  onChange={handleChange('email')}
                  className="mt-1"
                  aria-invalid={!!errors.email}
                  aria-describedby={errors.email ? 'email-error' : undefined}
                  disabled={isLoading}
                />
                {errors.email && (
                  <p id="email-error" className="mt-1 text-sm text-red-600" role="alert">
                    {errors.email}
                  </p>
                )}
              </div>

              <div>
                <Label htmlFor="password" className="block text-gray-900">
                  {t('auth.password')}
                </Label>
                <div className="relative mt-1">
                  <Input
                    id="password"
                    name="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    value={formData.password}
                    onChange={handleChange('password')}
                    className="pr-10"
                    aria-invalid={!!errors.password}
                    aria-describedby={errors.password ? 'password-error' : undefined}
                    disabled={isLoading}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-500 hover:text-gray-700"
                    aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                  >
                    {showPassword ? (
                      <EyeOff className="w-5 h-5" />
                    ) : (
                      <Eye className="w-5 h-5" />
                    )}
                  </button>
                </div>
                {errors.password && (
                  <p id="password-error" className="mt-1 text-sm text-red-600" role="alert">
                    {errors.password}
                  </p>
                )}
              </div>
            </div>

            <div>
              <Button
                type="submit"
                className="w-full"
                disabled={isLoading}
                aria-busy={isLoading}
              >
                {isLoading ? t('common.loading') : t('auth.signIn')}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
