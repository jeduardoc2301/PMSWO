---
inclusion: auto
---

# Guía de Diseño para Dialogs/Modales

Esta guía establece los estándares de diseño para todos los componentes Dialog/Modal en el proyecto para asegurar consistencia y accesibilidad.

## Reglas Obligatorias

### 1. Labels y Texto

**SIEMPRE** usar `text-gray-900` en los labels para asegurar contraste adecuado:

```tsx
<Label htmlFor="fieldName" className="text-gray-900">
  {t('labelKey')}
</Label>
```

❌ **INCORRECTO** (texto invisible en modo oscuro):
```tsx
<Label htmlFor="fieldName">{t('labelKey')}</Label>
```

✅ **CORRECTO**:
```tsx
<Label htmlFor="fieldName" className="text-gray-900">{t('labelKey')}</Label>
```

### 2. Estructura del Dialog

Usar siempre esta estructura base:

```tsx
<Dialog open={open} onOpenChange={setOpen}>
  <DialogContent className="sm:max-w-[600px]">
    <DialogHeader>
      <DialogTitle>{t('title')}</DialogTitle>
      <DialogDescription>
        {t('description')}
      </DialogDescription>
    </DialogHeader>
    
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Mensajes de error */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-md p-3 text-sm text-red-800">
          {error}
        </div>
      )}

      {/* Campos del formulario */}
      <div className="space-y-4 py-4">
        <div className="space-y-2">
          <Label htmlFor="field" className="text-gray-900">
            {t('fieldLabel')}
          </Label>
          <Input
            id="field"
            value={value}
            onChange={handleChange}
            className={errors.field ? 'border-red-500' : ''}
          />
          {errors.field && (
            <p className="text-sm text-red-600">{errors.field}</p>
          )}
        </div>
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={() => setOpen(false)}>
          {t('cancel')}
        </Button>
        <Button type="submit" disabled={submitting}>
          {submitting ? t('submitting') : t('submit')}
        </Button>
      </DialogFooter>
    </form>
  </DialogContent>
</Dialog>
```

### 3. Selectores vs Inputs de Texto

**Usar Select cuando:**
- El valor debe ser uno de una lista predefinida
- Se relaciona con otra entidad (usuarios, work items, proyectos, etc.)
- Hay opciones limitadas y conocidas

**Usar Input cuando:**
- El valor es texto libre
- El usuario debe escribir información única
- No hay lista predefinida de opciones

❌ **INCORRECTO** (ID de work item como texto libre):
```tsx
<Input
  id="workItemId"
  value={formData.workItemId}
  onChange={(e) => setFormData({ ...formData, workItemId: e.target.value })}
/>
```

✅ **CORRECTO** (Selector de work items):
```tsx
<Select
  value={formData.workItemId}
  onValueChange={(value) => setFormData({ ...formData, workItemId: value })}
>
  <SelectTrigger>
    <SelectValue placeholder={t('selectWorkItem')} />
  </SelectTrigger>
  <SelectContent>
    {workItems.map((item) => (
      <SelectItem key={item.id} value={item.id}>
        {item.title}
      </SelectItem>
    ))}
  </SelectContent>
</Select>
```

### 4. Validación y Errores

Siempre mostrar errores de validación:

```tsx
{errors.field && (
  <p className="text-sm text-red-600">{errors.field}</p>
)}
```

Resaltar campos con error:
```tsx
<Input
  className={errors.field ? 'border-red-500' : ''}
/>
```

### 5. Estados de Carga

Deshabilitar botones y mostrar estado de carga:

```tsx
<Button type="submit" disabled={submitting || !isFormValid}>
  {submitting ? t('creating') : t('create')}
</Button>
```

### 6. Colores y Contraste

**Colores aprobados para texto:**
- Labels: `text-gray-900`
- Texto normal: `text-gray-900`
- Texto secundario: `text-gray-600`
- Errores: `text-red-600`
- Placeholders: `text-gray-600` (ya definido en Input component)

**NUNCA usar:**
- `text-gray-400` o `text-gray-500` para labels (bajo contraste)
- Texto sin clase de color (hereda y puede ser invisible)

### 7. Traducciones

Todos los textos deben estar traducidos:

```tsx
// ✅ CORRECTO
<Label>{t('fieldLabel')}</Label>
<Button>{t('submit')}</Button>

// ❌ INCORRECTO
<Label>Field Label</Label>
<Button>Submit</Button>
```

## Checklist para Nuevos Dialogs

Antes de crear un PR con un nuevo dialog, verificar:

- [ ] Todos los labels tienen `className="text-gray-900"`
- [ ] Los campos relacionales usan Select, no Input
- [ ] Hay validación de errores visible
- [ ] Los botones muestran estado de carga
- [ ] Todo el texto está traducido (español y portugués)
- [ ] Los errores se muestran en rojo con buen contraste
- [ ] El dialog tiene DialogHeader con título y descripción
- [ ] El DialogFooter tiene botones de Cancelar y Acción principal

## Ejemplos de Referencia

Ver estos componentes como ejemplos correctos:
- `components/projects/create-work-item-dialog.tsx`
- `components/projects/blockers-tab.tsx` (después de las correcciones)

## Componentes UI Base

Los componentes base ya tienen estilos correctos:
- `components/ui/input.tsx` - placeholder: text-gray-600, text: text-gray-900
- `components/ui/label.tsx` - text-gray-900
- `components/ui/textarea.tsx` - placeholder: text-gray-600, text: text-gray-900
- `components/ui/button.tsx` - variantes con buen contraste
- `components/ui/select.tsx` - bg-white, text-gray-900

Pero SIEMPRE agregar `className="text-gray-900"` explícitamente en los Labels dentro de Dialogs para asegurar el contraste correcto.
