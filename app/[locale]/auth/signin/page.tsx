'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { signIn } from 'next-auth/react'
import { useTranslations } from 'next-intl'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

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
        // Redirect to dashboard on success
        router.push('/es/dashboard')
        router.refresh()
      }
    } catch (error) {
      if (error instanceof z.ZodError) {
        // Handle validation errors
        const fieldErrors: Partial<Record<keyof SignInFormData, string>> = {}
        error.errors?.forEach((err) => {
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
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-12 sm:px-6 lg:px-8">
      <div className="w-full max-w-md space-y-8">
        <div>
          <h1 className="text-center text-3xl font-bold tracking-tight text-gray-900">
            {t('common.appName')}
          </h1>
          <h2 className="mt-6 text-center text-2xl font-semibold text-gray-700">
            {t('auth.signIn')}
          </h2>
        </div>

        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          {authError && (
            <div
              className="rounded-md bg-red-50 p-4 text-sm text-red-800"
              role="alert"
              aria-live="polite"
            >
              {authError}
            </div>
          )}

          <div className="space-y-4 rounded-md shadow-sm">
            <div>
              <Label htmlFor="email" className="block text-gray-700">
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
              <Label htmlFor="password" className="block text-gray-700">
                {t('auth.password')}
              </Label>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                value={formData.password}
                onChange={handleChange('password')}
                className="mt-1"
                aria-invalid={!!errors.password}
                aria-describedby={errors.password ? 'password-error' : undefined}
                disabled={isLoading}
              />
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
  )
}
