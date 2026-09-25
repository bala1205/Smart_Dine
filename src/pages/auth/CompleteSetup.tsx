import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { doc, getDoc, query, collection, where, getDocs } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { useAuth } from "../../hooks/useAuth";
import { createOwnerSetup } from "../../services/restaurantService";
import { z } from "zod";
import { Input } from "../../components/common/Form";
import { Button } from "../../components/common/Button";
import { AuthLayout } from "./AuthLayout";

type SetupForm = {
  fullName: string;
  restaurantName: string;
};

interface Diagnostics {
  profileExists: boolean;
  ownedRestaurants: number;
  checked: boolean;
}

const setupSchema = z.object({
  fullName: z.string().min(2, "Full name is required"),
  restaurantName: z.string().min(2, "Restaurant name is required"),
});

export default function CompleteSetup() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [diagnostics, setDiagnostics] = useState<Diagnostics>({
    profileExists: false,
    ownedRestaurants: 0,
    checked: false,
  });
  const [loading, setLoading] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SetupForm>({
    resolver: zodResolver(setupSchema),
  });

  useEffect(() => {
    let active = true;
    async function check() {
      if (!user) return;
      let profileExists = false;
      let ownedRestaurants = 0;
      try {
        const profSnap = await getDoc(doc(db, "users", user.uid));
        profileExists = profSnap.exists();
        const restSnap = await getDocs(
          query(collection(db, "restaurants"), where("ownerId", "==", user.uid))
        );
        ownedRestaurants = restSnap.size;
      } catch {
        // Diagnostics are best-effort; the recovery call below re-checks anyway.
      }
      if (active) setDiagnostics({ profileExists, ownedRestaurants, checked: true });
    }
    check();
    return () => {
      active = false;
    };
  }, [user]);

  async function onSubmit(data: SetupForm) {
    if (!user) return;
    setLoading(true);
    try {
      const result = await createOwnerSetup({
        uid: user.uid,
        email: user.email ?? "",
        fullName: data.fullName,
        restaurantName: data.restaurantName,
      });
      const parts = [];
      if (result.restaurantCreated) parts.push("restaurant");
      if (result.profileCreated) parts.push("profile");
      if (parts.length === 0) {
        toast.success("Your account setup is already complete.");
      } else {
        toast.success(`Created missing ${parts.join(" and ")}.`);
      }
      navigate("/owner/dashboard");
    } catch (err: unknown) {
      const wrapped = err as { code?: string; message?: string };
      if (import.meta.env.DEV) console.error("[complete-setup] failed. code:", wrapped?.code, "message:", wrapped?.message);
      toast.error("Unable to complete setup. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout title="Complete your setup" subtitle="Resume an incomplete registration">
      {diagnostics.checked && (
        <div className="mb-4 text-sm">
          <p className="text-gray-700 mb-2">
            We detected a partially-registered account for{" "}
            <span className="font-medium">{user?.email}</span>:
          </p>
          <ul className="space-y-1 text-gray-600">
            <li>
              Owner profile:{" "}
              <b className={diagnostics.profileExists ? "text-green-600" : "text-red-600"}>
                {diagnostics.profileExists ? "present" : "missing"}
              </b>
            </li>
            <li>
              Owned restaurant(s):{" "}
              <b className={diagnostics.ownedRestaurants > 0 ? "text-green-600" : "text-red-600"}>
                {diagnostics.ownedRestaurants > 0 ? `${diagnostics.ownedRestaurants} found` : "missing"}
              </b>
            </li>
          </ul>
          <p className="mt-2 text-gray-500">
            Only the missing items will be created. Nothing is deleted and no duplicate account is made.
          </p>
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <Input
          label="Full Name"
          placeholder="Owner name"
          error={errors.fullName?.message}
          {...register("fullName")}
        />
        <Input
          label="Restaurant Name"
          placeholder="e.g. Spice Garden"
          error={errors.restaurantName?.message}
          {...register("restaurantName")}
        />
        <Button type="submit" loading={loading} className="w-full">
          Complete Setup
        </Button>
      </form>
    </AuthLayout>
  );
}
