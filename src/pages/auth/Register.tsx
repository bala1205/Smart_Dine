import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { registerSchema } from "../../utils/validation";
import { Input } from "../../components/common/Form";
import { Button } from "../../components/common/Button";
import { createRestaurantAndProfile } from "../../services/restaurantService";
import { getRegistrationErrorMessage } from "../../services/authService";
import { AuthLayout } from "./AuthLayout";

type RegisterForm = {
  fullName: string;
  email: string;
  password: string;
  confirmPassword: string;
  restaurantName: string;
};

export default function Register() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RegisterForm>({
    resolver: zodResolver(registerSchema),
  });

  async function onSubmit(data: RegisterForm) {
    setLoading(true);
    try {
      const { restaurantId } = await createRestaurantAndProfile({
        fullName: data.fullName,
        email: data.email,
        password: data.password,
        restaurantName: data.restaurantName,
      });
      toast.success("Account created successfully");
      navigate("/owner/dashboard");
    } catch (err: unknown) {
      // Development/diagnosis: log the real Firebase error (code + message) to
      // the browser console so it is never hidden behind the generic toast.
      const wrapped = err as { code?: string; message?: string };
      console.error("[register] failed. code:", wrapped?.code, "message:", wrapped?.message, "full:", err);
      toast.error(getRegistrationErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout title="Create your restaurant account">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <Input
          label="Full Name"
          autoComplete="name"
          placeholder="Owner name"
          error={errors.fullName?.message}
          {...register("fullName")}
        />
        <Input
          label="Email"
          type="email"
          autoComplete="email"
          placeholder="owner@example.com"
          error={errors.email?.message}
          {...register("email")}
        />
        <Input
          label="Password"
          type="password"
          autoComplete="new-password"
          placeholder="At least 6 characters"
          error={errors.password?.message}
          {...register("password")}
        />
        <Input
          label="Confirm Password"
          type="password"
          autoComplete="new-password"
          placeholder="Repeat password"
          error={errors.confirmPassword?.message}
          {...register("confirmPassword")}
        />
        <Input
          label="Restaurant Name"
          placeholder="e.g. Spice Garden"
          error={errors.restaurantName?.message}
          {...register("restaurantName")}
        />
        <Button type="submit" loading={loading} className="w-full">
          Create Account
        </Button>
      </form>
      <p className="mt-6 text-sm text-center text-gray-600">
        Already have an account?{" "}
        <Link to="/login" className="text-brand-600 font-medium hover:underline">
          Login
        </Link>
      </p>
    </AuthLayout>
  );
}
