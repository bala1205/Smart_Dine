import { useMemo, useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Search, Plus, Pencil, Trash2, ImagePlus } from "lucide-react";
import { useAuth } from "../../hooks/useAuth";
import { useMenu } from "../../hooks/useMenu";
import {
  addMenuItem,
  updateMenuItem,
  deleteMenuItem,
} from "../../services/menuService";
import { uploadFile, menuImagePath } from "../../services/storageService";
import { fileValidation, menuItemSchema } from "../../utils/validation";
import { formatCurrency } from "../../utils/formatting";
import { Input, Select, TextArea } from "../../components/common/Form";
import { Button } from "../../components/common/Button";
import { Modal, ConfirmDialog } from "../../components/common/Modal";
import { EmptyState } from "../../components/common/States";
import type { MenuItem } from "../../types/menu";

type MenuForm = {
  name: string;
  description: string;
  price: number;
  categoryId: string;
  preparationTime: number;
};

export default function OwnerMenu() {
  const { profile } = useAuth();
  const restaurantId = profile?.restaurantId ?? "";
  const { categories, items, loading, setItems, error } = useMenu(restaurantId);
  const [search, setSearch] = useState("");
  const [filterCat, setFilterCat] = useState("all");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<MenuItem | null>(null);
  const [deleting, setDeleting] = useState<MenuItem | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    control,
    formState: { errors },
  } = useForm<MenuForm>({
    resolver: zodResolver(menuItemSchema),
    defaultValues: { categoryId: "" },
  });

  const filtered = useMemo(() => {
    let list = items.slice().sort((a, b) => a.name.localeCompare(b.name));
    if (filterCat !== "all") list = list.filter((i) => i.categoryId === filterCat);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((i) => i.name.toLowerCase().includes(q));
    }
    return list;
  }, [items, search, filterCat]);

  function openAdd() {
    setEditing(null);
    setImageFile(null);
    reset({
      name: "",
      description: "",
      price: 0,
      categoryId: categories[0]?.id || "",
      preparationTime: 0,
    });
    setModalOpen(true);
  }

  function openEdit(item: MenuItem) {
    setEditing(item);
    setImageFile(null);
    reset({
      name: item.name,
      description: item.description,
      price: item.price,
      categoryId: item.categoryId,
      preparationTime: item.preparationTime,
    });
    setModalOpen(true);
  }

  async function onSubmit(data: MenuForm) {
    setSaving(true);
    try {
      let imageUrl = editing?.imageUrl || "";
      if (imageFile) {
        const err = fileValidation(imageFile);
        if (err) {
          toast.error(err);
          setSaving(false);
          return;
        }
        setUploading(true);
        try {
          imageUrl = await uploadFile(
            menuImagePath(restaurantId, imageFile.name),
            imageFile
          );
        } catch {
          imageUrl = "";
          toast.warning(
            "Image upload is unavailable (Firebase Storage not enabled). Item will be saved without an image."
          );
        } finally {
          setUploading(false);
        }
      }
      if (editing) {
        await updateMenuItem(restaurantId, editing.id, {
          name: data.name,
          description: data.description,
          price: data.price,
          categoryId: data.categoryId,
          preparationTime: data.preparationTime,
          imageUrl,
        });
        toast.success("Item updated");
      } else {
        await addMenuItem(restaurantId, {
          name: data.name,
          description: data.description,
          price: data.price,
          categoryId: data.categoryId,
          preparationTime: data.preparationTime,
          imageUrl,
          isAvailable: true,
        });
        toast.success("Item added");
      }
      setModalOpen(false);
      refreshItems();
    } catch {
      toast.error("Failed to save item");
    } finally {
      setSaving(false);
    }
  }

  async function refreshItems() {
    const mod = await import("../../services/menuService");
    const list = await mod.getMenuItems(restaurantId);
    setItems(list);
  }

  async function toggleAvailable(item: MenuItem) {
    try {
      await updateMenuItem(restaurantId, item.id, { isAvailable: !item.isAvailable });
      refreshItems();
    } catch {
      toast.error("Failed to update availability");
    }
  }

  async function confirmDelete() {
    if (!deleting) return;
    try {
      await deleteMenuItem(restaurantId, deleting.id);
      toast.success("Item deleted");
      setDeleting(null);
      refreshItems();
    } catch {
      toast.error("Failed to delete item");
    }
  }

  const catName = (id: string) => categories.find((c) => c.id === id)?.name || "Uncategorized";

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Menu Items</h1>
          <p className="text-gray-500 text-sm">Manage the food items customers see</p>
        </div>
        <Button onClick={openAdd}>
          <Plus className="w-4 h-4" /> Add Item
        </Button>
      </div>

      <div className="flex flex-wrap gap-3 mb-4">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search items..."
            className="w-full pl-10 pr-4 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>
        <select
          value={filterCat}
          onChange={(e) => setFilterCat(e.target.value)}
          className="px-3 py-2 rounded-lg border border-gray-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
        >
          <option value="all">All Categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="text-center text-gray-500 py-16">Loading menu...</div>
      ) : error ? (
        <div className="text-center text-red-600 py-16 border border-red-200 bg-red-50 rounded-xl">
          {error}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          title="No menu items"
          description="Add your first food item to get started."
          action={
            <Button onClick={openAdd}>
              <Plus className="w-4 h-4" /> Add Item
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((item) => (
            <div key={item.id} className="bg-white rounded-xl shadow-sm p-4 flex gap-4">
              {item.imageUrl ? (
                <img src={item.imageUrl} alt={item.name} className="w-20 h-20 rounded-lg object-cover flex-shrink-0" />
              ) : (
                <div className="w-20 h-20 rounded-lg bg-gray-100 flex items-center justify-center text-2xl flex-shrink-0">🍽️</div>
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-semibold text-gray-800 truncate">{item.name}</h3>
                  <button onClick={() => openEdit(item)} className="text-gray-400 hover:text-gray-600">
                    <Pencil className="w-4 h-4" />
                  </button>
                </div>
                <p className="text-xs text-gray-500 mt-0.5">{catName(item.categoryId)}</p>
                <div className="mt-2 flex items-center justify-between">
                  <span className="font-bold text-gray-900">{formatCurrency(item.price)}</span>
                  <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={item.isAvailable}
                      onChange={() => toggleAvailable(item)}
                      className="accent-brand-600"
                    />
                    Available
                  </label>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? "Edit Menu Item" : "Add Menu Item"}
        wide
      >
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <Input
            label="Name"
            placeholder="e.g. Chicken Biriyani"
            error={errors.name?.message}
            {...register("name")}
          />
          <TextArea
            label="Description"
            placeholder="Brief description"
            error={errors.description?.message}
            rows={2}
            {...register("description")}
          />
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Price (₹)"
              type="number"
              step="0.01"
              placeholder="180"
              error={errors.price?.message}
              {...register("price")}
            />
            <Input
              label="Prep Time (min)"
              type="number"
              placeholder="0"
              error={errors.preparationTime?.message}
              {...register("preparationTime")}
            />
          </div>
          <Controller
            name="categoryId"
            control={control}
            render={({ field }) => (
              <Select
                label="Category"
                error={errors.categoryId?.message}
                value={field.value}
                onChange={(e) => field.onChange(e.target.value)}
                onBlur={field.onBlur}
              >
                <option value="">Select category</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </Select>
            )}
          />
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Image</label>
            <label className="flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed border-gray-300 text-sm text-gray-600 cursor-pointer hover:border-brand-400">
              <ImagePlus className="w-4 h-4" />
              {imageFile ? imageFile.name : (editing?.imageUrl ? "Replace image" : "Upload image")}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => setImageFile(e.target.files?.[0] || null)}
              />
            </label>
          </div>
          <div className="flex justify-end gap-3">
            <Button type="button" variant="secondary" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={saving || uploading}>
              {editing ? "Save Changes" : "Add Item"}
            </Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={!!deleting}
        title="Delete Menu Item"
        message={`Are you sure you want to delete "${deleting?.name}"? This cannot be undone.`}
        confirmLabel="Delete"
        danger
        onConfirm={confirmDelete}
        onCancel={() => setDeleting(null)}
      />
    </div>
  );
}
