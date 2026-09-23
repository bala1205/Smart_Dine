import { useEffect, useState } from "react";
import { collection, query, orderBy, onSnapshot, Unsubscribe } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useAuth } from "../../hooks/useAuth";
import { createKitchenStaff, setStaffActive } from "../../services/staffService";
import { staffSchema } from "../../utils/validation";
import { Input } from "../../components/common/Form";
import { Button } from "../../components/common/Button";
import { Modal } from "../../components/common/Modal";
import { EmptyState } from "../../components/common/States";
import { formatDate } from "../../utils/formatting";
import type { StaffMember } from "../../types/restaurant";

type StaffForm = {
  fullName: string;
  email: string;
  password: string;
};

export default function OwnerStaff() {
  const { profile } = useAuth();
  const restaurantId = profile?.restaurantId ?? "";
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<StaffForm>({ resolver: zodResolver(staffSchema) });

  useEffect(() => {
    let unsub: Unsubscribe;
    if (restaurantId) {
      unsub = onSnapshot(
        query(collection(db, "restaurants", restaurantId, "staff"), orderBy("createdAt", "asc")),
        (snap) => {
          setStaff(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<StaffMember, "id">) })));
          setLoading(false);
        },
        () => setLoading(false)
      );
    }
    return () => unsub?.();
  }, [restaurantId]);

  async function onSubmit(data: StaffForm) {
    setCreating(true);
    try {
      await createKitchenStaff({
        restaurantId,
        fullName: data.fullName,
        email: data.email,
        password: data.password,
      });
      toast.success("Kitchen staff added");
      setModalOpen(false);
      reset();
    } catch (e: unknown) {
      const err = e as { code?: string };
      if (err.code === "auth/email-already-in-use") {
        toast.error("This email is already registered");
      } else {
        toast.error("Failed to add staff");
      }
    } finally {
      setCreating(false);
    }
  }

  async function toggleActive(s: StaffMember) {
    try {
      await setStaffActive(restaurantId, s.id, !s.isActive);
    } catch {
      toast.error("Failed to update staff");
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Kitchen Staff</h1>
          <p className="text-gray-500 text-sm">Manage who can access the kitchen dashboard</p>
        </div>
        <Button onClick={() => setModalOpen(true)}>
          <Plus className="w-4 h-4" /> Add Staff
        </Button>
      </div>

      {loading ? (
        <div className="text-center text-gray-500 py-16">Loading staff...</div>
      ) : staff.length === 0 ? (
        <EmptyState
          title="No kitchen staff"
          description="Add kitchen staff to allow them to view and update orders."
          action={
            <Button onClick={() => setModalOpen(true)}>
              <Plus className="w-4 h-4" /> Add Staff
            </Button>
          }
        />
      ) : (
        <div className="bg-white rounded-xl shadow-sm overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-100 text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Name</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Email</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Status</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Created</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {staff.map((s) => (
                <tr key={s.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-800">{s.fullName}</td>
                  <td className="px-4 py-3 text-gray-600">{s.email}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`text-xs font-medium px-2.5 py-0.5 rounded-full ${
                        s.isActive ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"
                      }`}
                    >
                      {s.isActive ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-500">{formatDate(s.createdAt)}</td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => toggleActive(s)}
                      className="text-sm text-brand-600 hover:underline"
                    >
                      {s.isActive ? "Deactivate" : "Reactivate"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Add Kitchen Staff">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <Input
            label="Full Name"
            placeholder="Staff name"
            error={errors.fullName?.message}
            {...register("fullName")}
          />
          <Input
            label="Email"
            type="email"
            placeholder="staff@example.com"
            error={errors.email?.message}
            {...register("email")}
          />
          <Input
            label="Password"
            type="password"
            placeholder="Temporary password"
            error={errors.password?.message}
            {...register("password")}
          />
          <p className="text-xs text-gray-500">
            Staff will use this email/password to log in to the kitchen dashboard.
          </p>
          <div className="flex justify-end gap-3">
            <Button type="button" variant="secondary" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={creating}>
              Add Staff
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
