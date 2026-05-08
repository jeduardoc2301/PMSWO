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
    <div className="rounded-xl overflow-hidden" style={{ background: '#18181b', border: '1px solid #27272a' }}>
      {/* Header */}
      <div className="px-6 py-4 flex items-center justify-between" style={{ borderBottom: '1px solid #27272a' }}>
        <div>
          <h2 className="text-sm font-semibold text-zinc-200">{t('title')}</h2>
          <p className="text-xs text-zinc-500 mt-0.5">{t('description')}</p>
        </div>
        <button onClick={() => setCreateDialogOpen(true)}
          className="h-8 flex items-center gap-1.5 px-3 rounded-lg text-xs font-medium text-white transition-all hover:opacity-90"
          style={{ background: '#6366f1' }}>
          <Plus size={13} /> {t('createCategory')}
        </button>
      </div>

      {/* Content */}
      <div>
        {loading ? (
          <div className="flex items-center justify-center py-16 gap-3 text-zinc-500">
            <Loader2 size={18} className="animate-spin text-indigo-500" />
            {t('loadingCategories')}
          </div>
        ) : error ? (
          <div className="m-4 rounded-xl p-4 text-sm text-rose-400"
            style={{ background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.18)' }}>
            {error}
          </div>
        ) : categories.length === 0 ? (
          <div className="py-16 text-center text-zinc-500 text-sm">{t('noCategories')}</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: '#111113', borderBottom: '1px solid #27272a' }}>
                {[t('categoryName'), t('createdAt'), t('actions')].map((h, i) => (
                  <th key={h} className={`px-5 py-3 text-[11px] font-semibold text-zinc-500 uppercase tracking-wider ${i === 2 ? 'text-right' : 'text-left'}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {categories.map((cat) => (
                <tr key={cat.id} className="border-b hover:bg-zinc-900/30 transition-all" style={{ borderColor: '#27272a' }}>
                  <td className="px-5 py-3.5 font-medium text-zinc-100">{cat.name}</td>
                  <td className="px-5 py-3.5 text-zinc-500 text-xs">
                    {new Date(cat.createdAt).toLocaleDateString('es', { day: '2-digit', month: 'short', year: 'numeric' })}
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="flex justify-end gap-1">
                      <button onClick={() => { setSelectedCategory(cat); setEditDialogOpen(true) }}
                        className="w-7 h-7 flex items-center justify-center rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-all">
                        <Pencil size={13} />
                      </button>
                      <button onClick={() => { setSelectedCategory(cat); setDeleteDialogOpen(true) }}
                        className="w-7 h-7 flex items-center justify-center rounded-lg text-zinc-500 hover:text-rose-400 hover:bg-rose-950/40 transition-all">
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
