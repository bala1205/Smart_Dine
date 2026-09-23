import { useState } from "react";
import { Link } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { forgotPasswordSchema } from "../../utils/validation";
import { Input } from "../../components/common/Form";
import { Button } from "../../components/common/Button";
import { resetPassword } from "../../services/authService";
import { AuthLayout } from "./AuthLayout";

type ForgotForm = {
  email: string;
};

export default function ForgotPassword() {
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ForgotForm>({
    resolver: zodResolver(forgotPasswordSchema),
  });

  async function onSubmit(data: ForgotForm) {
    setLoading(true);
    try {
      await resetPassword(data.email);
      setSent(true);
      toast.success("Password reset email sent");
    } catch {
      toast.error("Unable to send reset email. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout
      title="Reset your password"
      subtitle="We'll email you a link to reset your password"
    >
      {sent ? (
        <div className="text-center py-4">
          <p className="text-sm text-gray-600">
            If an account exists for that email, a reset link has been sent.
          </p>
          <Link to="/login" className="mt-4 inline-block text-sm text-brand-600 font-medium hover:underline">
            Back to Login
          </Link>
        </div>
      ) : (
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <Input
            label="Email"
            type="email"
            placeholder="you@example.com"
            error={errors.email?.message}
            {...register("email")}
          />
          <Button type="submit" loading={loading} className="w-full">
            Send Reset Link
          </Button>
        </form>
      )}
      <p className="mt-6 text-sm text-center text-gray-600">
        Remembered your password?{" "}
        <Link to="/login" className="text-brand-600 font-medium hover:underline">
          Login
        </Link>
      </p>
    </AuthLayout>
  );
}
