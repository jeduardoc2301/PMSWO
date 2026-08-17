/**
 * Projects Layout
 * 
 * Layout for authenticated projects pages.
 * Includes the MainNavWrapper which provides navigation and sign-out functionality.
 */

import { MainNavWrapper } from '@/components/navigation/main-nav-wrapper'

export default function ProjectsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex min-h-screen bg-[#09090b]">
      {/* Navigation sidebar with sign-out functionality */}
      <MainNavWrapper />
      
      {/* Main content area */}
      {/*
        `min-w-0` no es cosmético: sin él, este `main` es un hijo flex con `min-width: auto`, que en
        CSS significa «no encojas por debajo de tu contenido». Una tabla ancha adentro estiraba el
        `main` a 2 452 px dentro de un padre de 1 434 y desbordaba la página entera —el
        `overflow-x-auto` interno nunca llegaba a actuar porque su contenedor ya había crecido—.
        Con `min-w-0` el `main` se queda en su ancho y el scroll ocurre donde debe: dentro de la
        tabla. Medido con el navegador, no supuesto.
      */}
      <main className="flex-1 ml-64 min-w-0">
        {children}
      </main>
    </div>
  )
}
