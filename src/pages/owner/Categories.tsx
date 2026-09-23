import { useState } from "react";
import { doc, serverTimestamp } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, ChevronUp, ChevronDown } from "lucide-react";
import { useAuth } from "../../hooks/useAuth";
import { addCategory, updateCategory, deleteCategory } from "../../services/menuService";
import { useMenu } from "../../hooks/useMenu";
import { Input } from "../../components/common/Form";
import { Button } from "../../components/common/Button";
import { Modal, ConfirmDialog } from "../../components/common/Modal";
import { EmptyState } from "../../components/common/States";
import type { MenuCategory } from "../../types/menu";

export default function OwnerCategories() {
  const { profile } = useAuth();
  const restaurantId = profile?.restaurantId ?? "";
  const { categories } = useMenu(restaurantId);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [deleting, setDeleting] = useState<MenuCategory | null>(null);

  function openAdd() {
    setEditingId(null);
    setName("");
    setModalOpen(true);
  }

  function openEdit(cat: MenuCategory) {
    setEditingId(cat.id);
    setName(cat.name);
    setModalOpen(true);
  }

  async function save() {
    if (!name.trim()) {
      toast.error("Category name is required");
      return;
    }
    try {
      if (editingId) {
        await updateCategory(restaurantId, editingId, { name: name.trim() });
        toast.success("Category updated");
      } else {
        const maxOrder = categories.reduce((m, c) => Math.max(m, c.displayOrder), 0);
        await addCategory(restaurantId, name.trim(), maxOrder + 1);
        toast.success("Category added");
      }
      setModalOpen(false);
    } catch {
      toast.error("Failed to save category");
    }
  }

  async function toggleActive(cat: MenuCategory) {
    await updateCategory(restaurantId, cat.id, { isActive: !cat.isActive });
  }

  async function move(cat: MenuCategory, dir: -1 | 1) {
    const sorted = [...categories].sort((a, b) => a.displayOrder - b.displayOrder);
    const idx = sorted.findIndex((c) => c.id === cat.id);
    const target = sorted[idx + dir];
    if (!target) return;
    try {
      const { writeBatch } = await import("firebase/firestore");
      const batch = writeBatch(db);
      batch.update(doc(db, "restaurants", restaurantId, "categories", cat.id), {
        displayOrder: target.displayOrder,
        updatedAt: serverTimestamp(),
      });
      batch.update(doc(db, "restaurants", restaurantId, "categories", target.id), {
        displayOrder: cat.displayOrder,
        updatedAt: serverTimestamp(),
      });
      await batch.commit();
    } catch {
      toast.error("Failed to reorder");
    }
  }

  async function confirmDelete() {
    if (!deleting) return;
    try {
      await deleteCategory(restaurantId, deleting.id);
      toast.success("Category deleted");
      setDeleting(null);
    } catch {
      toast.error("Failed to delete category");
    }
  }

  const sorted = [...categories].sort((a, b) => a.displayOrder - b.displayOrder);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Menu Categories</h1>
          <p className="text-gray-500 text-sm">Organize menu items into categories</p>
        </div>
        <Button onClick={openAdd}>
          <Plus className="w-4 h-4" /> Add Category
        </Button>
      </div>

      {sorted.length === 0 ? (
        <EmptyState
          title="No categories yet"
          description="Create categories like Biriyani, Starters, Desserts."
          action={
            <Button onClick={openAdd}>
              <Plus className="w-4 h-4" /> Add Category
            </Button>
          }
        />
      ) : (
        <div className="bg-white rounded-xl shadow-sm divide-y divide-gray-100">
          {sorted.map((cat, i) => (
            <div key={cat.id} className="px-4 py-3 flex items-center gap-3">
              <div className="flex flex-col">
                <button
                  onClick={() => move(cat, -1)}
                  disabled={i === 0}
                  className="text-gray-400 hover:text-gray-600 disabled:opacity-30"
                >
                  <ChevronUp className="w-4 h-4" />
                </button>
                <button
                  onClick={() => move(cat, 1)}
                  disabled={i === sorted.length - 1}
                  className="text-gray-400 hover:text-gray-600 disabled:opacity-30"
                >
                  <ChevronDown className="w-4 h-4" />
                </button>
              </div>
              <div className="flex-1">
                <div className="font-medium text-gray-800">{cat.name}</div>
                <div className="text-xs text-gray-400">Order: {cat.displayOrder}</div>
              </div>
              <button
                onClick={() => toggleActive(cat)}
                className={`text-xs font-medium px-2.5 py-1 rounded-full ${
                  cat.isActive ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"
                }`}
              >
                {cat.isActive ? "Active" : "Disabled"}
              </button>
              <button onClick={() => openEdit(cat)} className="text-gray-400 hover:text-gray-600">
                <Pencil className="w-4 h-4" />
              </button>
              <button onClick={() => setDeleting(cat)} className="text-gray-400 hover:text-red-600">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editingId ? "Edit Category" : "Add Category"}>
        <Input
          label="Category Name"
          placeholder="e.g. Biriyani"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <div className="flex justify-end gap-3 mt-6">
          <Button type="button" variant="secondary" onClick={() => setModalOpen(false)}>
            Cancel
          </Button>
          <Button onClick={save}>{editingId ? "Save Changes" : "Add"}</Button>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!deleting}
        title="Delete Category"
        message={`Delete "${deleting?.name}"? Menu items in this category will remain but be uncategorized.`}
        confirmLabel="Delete"
        danger
        onConfirm={confirmDelete}
        onCancel={() => setDeleting(null)}
      />
    </div>
  );
}
