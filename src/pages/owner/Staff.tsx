import { useEffect, useState } from "react";
import { collection, query, orderBy, onSnapshot, Unsubscribe } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useAuth } from "../../hooks/useAuth";
import { createStaffWithRole, setStaffActive } from "../../services/staffService";
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
  role: "KITCHEN" | "WAITER";
};

export default function OwnerStaff() {
  const { profile } = useAuth();
  const restaurantId = profile?.restaurantId ?? "";
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [role, setRole] = useState<"KITCHEN" | "WAITER">("KITCHEN");
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
      await createStaffWithRole({
        restaurantId,
        fullName: data.fullName,
        email: data.email,
        password: data.password,
        role,
      });
      toast.success(`${role === "WAITER" ? "Waiter" : "Kitchen"} staff added`);
      setModalOpen(false);
      reset();
      setRole("KITCHEN");
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
          <h1 className="text-2xl font-bold text-gray-800">Staff Management</h1>
          <p className="text-gray-500 text-sm">Manage kitchen and waiter staff for your restaurant</p>
        </div>
        <Button onClick={() => setModalOpen(true)}>
          <Plus className="w-4 h-4" /> Add Staff
        </Button>
      </div>

      {loading ? (
        <div className="text-center text-gray-500 py-16">Loading staff...</div>
      ) : staff.length === 0 ? (
        <EmptyState
          title="No staff yet"
          description="Add kitchen or waiter staff to allow them to access their dashboards."
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
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Role</th>
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
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${s.role === "WAITER" ? "bg-blue-100 text-blue-700" : "bg-orange-100 text-orange-700"}`}>
                      {s.role}
                    </span>
                  </td>
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

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Add Staff">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
            <div className="flex gap-2">
              <button type="button" onClick={() => setRole("KITCHEN")} className={`flex-1 py-2 rounded-lg text-sm font-medium border ${role === "KITCHEN" ? "bg-orange-50 border-orange-300 text-orange-700" : "bg-white border-gray-200 text-gray-600"}`}>🍳 Kitchen</button>
              <button type="button" onClick={() => setRole("WAITER")} className={`flex-1 py-2 rounded-lg text-sm font-medium border ${role === "WAITER" ? "bg-blue-50 border-blue-300 text-blue-700" : "bg-white border-gray-200 text-gray-600"}`}>🔔 Waiter</button>
            </div>
          </div>
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
            Staff will use this email/password to log in to the {role === "WAITER" ? "waiter" : "kitchen"} dashboard.
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
