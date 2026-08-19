import { hashPassword, comparePassword } from '../password'

/**
 * Con más margen que los cinco segundos de por omisión.
 *
 * `bcrypt` está hecho para ser lento a propósito —es su trabajo— y con doce factores de sal cada
 * hash cuesta cientos de milisegundos. Sueltas estas pruebas tardan poco; dentro de la suite
 * completa, con ciento sesenta archivos peleando por la CPU, se van de los cinco segundos. Lo que
 * falla ahí es el reloj, no el código, y bajarle el factor de sal para que corran sería probar una
 * configuración que no es la que se despliega.
 */
describe('Password Utilities', { timeout: 30000 }, () => {
  describe('hashPassword', () => {
    it('should hash a password', async () => {
      const password = 'testPassword123!'
      const hashed = await hashPassword(password)

      expect(hashed).toBeDefined()
      expect(hashed).not.toBe(password)
      expect(hashed.length).toBeGreaterThan(0)
    })

    it('should generate different hashes for the same password', async () => {
      const password = 'testPassword123!'
      const hash1 = await hashPassword(password)
      const hash2 = await hashPassword(password)

      expect(hash1).not.toBe(hash2)
    })

    it('should hash passwords with minimum salt factor of 10', async () => {
      const password = 'testPassword123!'
      const hashed = await hashPassword(password)

      // bcrypt hashes start with $2b$ followed by cost factor
      // Format: $2b$<cost>$<salt><hash>
      const costMatch = hashed.match(/^\$2[aby]\$(\d+)\$/)
      expect(costMatch).toBeTruthy()

      if (costMatch) {
        const cost = parseInt(costMatch[1], 10)
        expect(cost).toBeGreaterThanOrEqual(10)
      }
    })
  })

  describe('comparePassword', () => {
    it('should return true for matching password', async () => {
      const password = 'testPassword123!'
      const hashed = await hashPassword(password)
      const isMatch = await comparePassword(password, hashed)

      expect(isMatch).toBe(true)
    })

    it('should return false for non-matching password', async () => {
      const password = 'testPassword123!'
      const wrongPassword = 'wrongPassword456!'
      const hashed = await hashPassword(password)
      const isMatch = await comparePassword(wrongPassword, hashed)

      expect(isMatch).toBe(false)
    })

    it('should handle empty passwords', async () => {
      const password = ''
      const hashed = await hashPassword(password)
      const isMatch = await comparePassword(password, hashed)

      expect(isMatch).toBe(true)
    })

    it('should be case-sensitive', async () => {
      const password = 'TestPassword123!'
      const hashed = await hashPassword(password)
      const isMatch = await comparePassword('testpassword123!', hashed)

      expect(isMatch).toBe(false)
    })
  })
})
