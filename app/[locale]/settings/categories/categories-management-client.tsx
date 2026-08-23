'use client'

import { useState, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { Plus, Loader2, Pencil, Trash2 } from 'lucide-react'
import { CreateCategoryDialog } from '@/components/categories/create-category-dialog'
import { EditCategoryDialog } from '@/components/categories/edit-category-dialog'
import { DeleteCategoryDialog } from '@/components/categories/delete-category-dialog'

interface Category {
  id: string; name: string; createdAt: string
}

export function CategoriesManagementClient() {
  const t = useTranslations('categories')
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null)

  const fetchCategories = async () => {
    try {
      setLoading(true); setError(null)
      const res = await fetch('/api/v1/template-categories')
      if (!res.ok) throw new Error('Failed to fetch categories')
      const data = await res.json()
      setCategories(data.categories || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchCategories() }, [])

  return (
    <div className="rounded-xl overflow-hidden" style={{ background: 'var(--superficie)', border: '1px solid var(--borde)' }}>
      {/* Header */}
      <div className="px-6 py-4 flex items-center justify-between" style={{ borderBottom: '1px solid var(--borde)' }}>
        <div>
          <h2 className="text-sm font-semibold text-tinta">{t('title')}</h2>
          <p className="text-xs text-tinta-3 mt-0.5">{t('description')}</p>
        </div>
        <button onClick={() => setCreateDialogOpen(true)}
          className="h-8 flex items-center gap-1.5 px-3 rounded-lg text-xs font-medium text-sobre-acento transition-all hover:opacity-90"
          style={{ background: 'var(--acento-relleno)' }}>
          <Plus size={13} /> {t('createCategory')}
        </button>
      </div>

      {/* Content */}
      <div>
        {loading ? (
          <div className="flex items-center justify-center py-16 gap-3 text-tinta-3">
            <Loader2 size={18} className="animate-spin text-indigo-500" />
            {t('loadingCategories')}
          </div>
        ) : error ? (
          <div className="m-4 rounded-xl p-4 text-sm text-rose-400"
            style={{ background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.18)' }}>
            {error}
          </div>
        ) : categories.length === 0 ? (
          <div className="py-16 text-center text-tinta-3 text-sm">{t('noCategories')}</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: 'var(--superficie)', borderBottom: '1px solid var(--borde)' }}>
                {[t('categoryName'), t('createdAt'), t('actions')].map((h, i) => (
                  <th key={h} className={`px-5 py-3 text-[11px] font-semibold text-tinta-3 uppercase tracking-wider ${i === 2 ? 'text-right' : 'text-left'}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {categories.map((cat) => (
                <tr key={cat.id} className="border-b hover:bg-superficie/30 transition-all" style={{ borderColor: 'var(--borde)' }}>
                  <td className="px-5 py-3.5 font-medium text-tinta">{cat.name}</td>
                  <td className="px-5 py-3.5 text-tinta-3 text-xs">
                    {new Date(cat.createdAt).toLocaleDateString('es', { day: '2-digit', month: 'short', year: 'numeric' })}
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="flex justify-end gap-1">
                      <button onClick={() => { setSelectedCategory(cat); setEditDialogOpen(true) }}
                        className="w-7 h-7 flex items-center justify-center rounded-lg text-tinta-3 hover:text-tinta hover:bg-superficie-3 transition-all">
                        <Pencil size={13} />
                      </button>
                      <button onClick={() => { setSelectedCategory(cat); setDeleteDialogOpen(true) }}
                        className="w-7 h-7 flex items-center justify-center rounded-lg text-tinta-3 hover:text-grave-tinta hover:bg-grave-fondo transition-all">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <CreateCategoryDialog open={createDialogOpen} onOpenChange={setCreateDialogOpen} onSuccess={fetchCategories} />

      {selectedCategory && (
        <>
          <EditCategoryDialog open={editDialogOpen} onOpenChange={setEditDialogOpen} onSuccess={fetchCategories} category={selectedCategory} />
          <DeleteCategoryDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen} onSuccess={fetchCategories} category={selectedCategory} />
        </>
      )}
    </div>
  )
}
