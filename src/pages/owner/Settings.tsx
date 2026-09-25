import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { ImagePlus } from "lucide-react";
import { useAuth } from "../../hooks/useAuth";
import { useRestaurant } from "../../hooks/useRestaurant";
import { updateRestaurant } from "../../services/restaurantService";
import { uploadFile, restaurantLogoPath } from "../../services/storageService";
import { fileValidation, restaurantSchema } from "../../utils/validation";
import { Input, TextArea } from "../../components/common/Form";
import { Button } from "../../components/common/Button";

type SettingsForm = {
  name: string;
  description: string;
  phone: string;
  address: string;
  gstPercent: number;
  serviceChargePercent: number;
};

export default function OwnerSettings() {
  const { profile } = useAuth();
  const restaurantId = profile?.restaurantId ?? "";
  const { restaurant, loading, setRestaurant } = useRestaurant(restaurantId);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SettingsForm>({
    resolver: zodResolver(restaurantSchema),
  });

  if (loading) {
    return <div className="text-center text-gray-500 py-16">Loading settings...</div>;
  }

  if (!restaurant) {
    return <div className="text-center text-gray-500 py-16">Restaurant not found.</div>;
  }

  async function onSubmit(data: SettingsForm) {
    if (!restaurant) return;
    setSaving(true);
    try {
      let logoUrl = restaurant.logoUrl;
      if (logoFile) {
        const err = fileValidation(logoFile);
        if (err) {
          toast.error(err);
          setSaving(false);
          return;
        }
        setUploading(true);
        try {
          logoUrl = await uploadFile(
            restaurantLogoPath(restaurantId, logoFile.name),
            logoFile
          );
        } catch {
          logoUrl = restaurant.logoUrl || "";
          toast.warning(
            "Logo upload is unavailable (Firebase Storage not enabled). Settings saved without a new logo."
          );
        } finally {
          setUploading(false);
        }
      }
      await updateRestaurant(restaurantId, {
        name: data.name,
        description: data.description,
        phone: data.phone,
        address: data.address,
        logoUrl,
        gstPercent: Number(data.gstPercent) || 0,
        serviceChargePercent: Number(data.serviceChargePercent) || 0,
      });
      setRestaurant({
        ...restaurant,
        name: data.name,
        description: data.description,
        phone: data.phone,
        address: data.address,
        logoUrl,
        gstPercent: Number(data.gstPercent) || 0,
        serviceChargePercent: Number(data.serviceChargePercent) || 0,
      });
      toast.success("Settings saved");
    } catch {
      toast.error("Failed to save settings");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold text-gray-800 mb-6">Restaurant Settings</h1>

      <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
        <div className="flex items-center gap-4 mb-6">
          {restaurant.logoUrl ? (
            <img src={restaurant.logoUrl} alt="Logo" className="w-16 h-16 rounded-full object-cover" />
          ) : (
            <div className="w-16 h-16 rounded-full bg-brand-100 flex items-center justify-center text-2xl font-bold text-brand-600">
              {restaurant.name.charAt(0).toUpperCase()}
            </div>
          )}
          <label className="flex items-center gap-2 px-4 py-2 rounded-lg border border-dashed border-gray-300 text-sm text-gray-600 cursor-pointer hover:border-brand-400">
            <ImagePlus className="w-4 h-4" />
            {uploading ? "Uploading..." : restaurant.logoUrl ? "Change Logo" : "Upload Logo"}
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => setLogoFile(e.target.files?.[0] || null)}
            />
          </label>
          {logoFile && <span className="text-xs text-gray-500">{logoFile.name}</span>}
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <Input
            label="Restaurant Name"
            defaultValue={restaurant.name}
            error={errors.name?.message}
            {...register("name")}
          />
          <TextArea
            label="Description"
            defaultValue={restaurant.description}
            rows={3}
            error={errors.description?.message}
            {...register("description")}
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Phone"
              defaultValue={restaurant.phone}
              placeholder="+91..."
              error={errors.phone?.message}
              {...register("phone")}
            />
          </div>
          <TextArea
            label="Address"
            defaultValue={restaurant.address}
            rows={2}
            placeholder="Restaurant address"
            error={errors.address?.message}
            {...register("address")}
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="GST %"
              type="number"
              step="0.1"
              placeholder="5"
              defaultValue={String(restaurant.gstPercent ?? 0)}
              error={errors.gstPercent?.message}
              {...register("gstPercent")}
            />
            <Input
              label="Service Charge %"
              type="number"
              step="0.1"
              placeholder="5"
              defaultValue={String(restaurant.serviceChargePercent ?? 0)}
              error={errors.serviceChargePercent?.message}
              {...register("serviceChargePercent")}
            />
          </div>
          <p className="text-xs text-gray-500">Bill will show GST and Service Charge based on these percentages. Set 0 to disable.</p>
          <Button type="submit" loading={saving || uploading}>
            Save Changes
          </Button>
        </form>
      </div>
    </div>
  );
}
