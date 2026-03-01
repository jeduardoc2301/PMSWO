# Password Hashing Utilities - Usage Examples

This document demonstrates how to use the password hashing utilities in the application.

## Overview

The password utilities provide secure password hashing using bcrypt with a salt factor of 12 (exceeding the minimum requirement of 10).

## Functions

### `hashPassword(password: string): Promise<string>`

Hashes a plain text password using bcrypt.

**Example:**
```typescript
import { hashPassword } from '@/lib/password'

// When creating a new user
const plainPassword = 'userPassword123!'
const hashedPassword = await hashPassword(plainPassword)

// Store hashedPassword in the database
await prisma.user.create({
  data: {
    email: 'user@example.com',
    passwordHash: hashedPassword,
    // ... other fields
  }
})
```

### `comparePassword(password: string, hashedPassword: string): Promise<boolean>`

Compares a plain text password with a hashed password.

**Example:**
```typescript
import { comparePassword } from '@/lib/password'

// When authenticating a user
const user = await prisma.user.findUnique({
  where: { email: 'user@example.com' }
})

if (user) {
  const isValid = await comparePassword('userPassword123!', user.passwordHash)
  
  if (isValid) {
    // Password is correct, proceed with authentication
  } else {
    // Password is incorrect
  }
}
```

## Integration with NextAuth

The password utilities are already integrated with NextAuth in `lib/auth.ts`:

```typescript
// In the CredentialsProvider authorize function
const isValidPassword = await comparePassword(
  credentials.password as string,
  user.passwordHash
)

if (!isValidPassword) {
  return null
}
```

## Security Features

1. **Salt Factor**: Uses bcrypt with salt factor of 12 (exceeds minimum requirement of 10)
2. **Unique Hashes**: Each password hash is unique due to random salt generation
3. **Slow Hashing**: bcrypt is intentionally slow to prevent brute-force attacks
4. **Industry Standard**: bcrypt is a well-tested, industry-standard hashing algorithm

## Requirements Validation

✅ **Requirement 15.3**: Passwords are hashed using bcrypt with salt factor 12 (minimum 10)
✅ **Never stored in plain text**: All passwords are hashed before storage
✅ **Secure comparison**: Uses bcrypt's built-in comparison to prevent timing attacks
