# Aislamiento entre organizaciones

**No hay red de seguridad automática. Cada consulta acota por organización, o filtra mal.**

Aquí vivía `lib/prisma-middleware.ts`, un middleware global que prometía añadir el
`organization_id` a todas las consultas. Se borró el 18 de agosto de 2026 por tres razones:

1. **Nadie lo registraba.** Sus únicas referencias en todo el repositorio eran sus propias
   líneas. El único `$use` vivo es el cronómetro de consultas lentas de `lib/prisma.ts`.
2. **Registrarlo habría sido peor.** `prisma.$use` es global y por proceso. Llamarlo por
   petición con el `organizationId` de esa petición contamina las peticiones concurrentes: el
   último registro gana para *todas* las consultas en vuelo, incluidas las de otras
   organizaciones. Y `getPrismaWithOrganization` apilaba un middleware nuevo en cada llamada,
   sin quitar el anterior.
3. **Costó una fuga real.** Las rutas de exportación llevaban escrito «el servicio filtra por
   organización» y el servicio no la mencionaba ni una vez. Cualquiera con permiso de exportar
   y el id de un proyecto ajeno recibía el informe completo con un 200. La fuga existió porque
   alguien dio por hecho este archivo.

## Cómo se hace aquí

```ts
// Sí. El acotado va en el `where`, siempre.
const proyecto = await prisma.project.findFirst({
  where: { id: projectId, organizationId },
})

// No. `findUnique` sólo acepta campos únicos, así que por construcción no puede acotar.
const proyecto = await prisma.project.findUnique({ where: { id: projectId } })
```

Un servicio que toque datos de un proyecto **recibe `organizationId` como parámetro
obligatorio**. Si es opcional, alguien lo omitirá.

## Si algún día se quiere una red global

Con Client Extensions y `AsyncLocalStorage` —contexto por petición, no estado global—, y
**nunca** como sustituto de acotar el `where`. Una red que se cree que está puesta y no lo
está es más peligrosa que no tener ninguna: es exactamente lo que pasó aquí.
