import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { loginSchema } from "../../utils/validation";
import { Input } from "../../components/common/Form";
import { Button } from "../../components/common/Button";
import { loginUser } from "../../services/authService";
import { AuthLayout } from "./AuthLayout";

type LoginForm = {
  email: string;
  password: string;
};

export default function Login() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
  });

  async function onSubmit(data: LoginForm) {
    setLoading(true);
    try {
      await loginUser(data.email, data.password);
      toast.success("Welcome back!");
      navigate("/");
    } catch (err: unknown) {
      const e = err as { code?: string };
      if (e.code === "auth/user-not-found" || e.code === "auth/wrong-password" || e.code === "auth/invalid-credential") {
        toast.error("Invalid email or password");
      } else if (e.code === "auth/too-many-requests") {
        toast.error("Too many attempts. Please try again later.");
      } else {
        toast.error("Unable to login. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout title="Login to your account">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <Input
          label="Email"
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          error={errors.email?.message}
          {...register("email")}
        />
        <Input
          label="Password"
          type="password"
          autoComplete="current-password"
          placeholder="Your password"
          error={errors.password?.message}
          {...register("password")}
        />
        <div className="text-right">
          <Link to="/forgot-password" className="text-sm text-brand-600 hover:underline">
            Forgot password?
          </Link>
        </div>
        <Button type="submit" loading={loading} className="w-full">
          Login
        </Button>
      </form>
      <p className="mt-6 text-sm text-center text-gray-600">
        New restaurant owner?{" "}
        <Link to="/register" className="text-brand-600 font-medium hover:underline">
          Register
        </Link>
      </p>
    </AuthLayout>
  );
}
