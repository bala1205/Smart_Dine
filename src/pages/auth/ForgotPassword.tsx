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
        <div className="text-center py-4" role="status">
          <div className="w-12 h-12 rounded-2xl bg-green-50 border border-green-200 flex items-center justify-center mx-auto mb-3" aria-hidden="true">
            <svg className="w-6 h-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
          </div>
          <p className="text-sm text-ink-500 leading-relaxed max-w-[38ch] mx-auto">
            If an account exists for that email, a reset link has been sent.
          </p>
          <Link to="/login" className="mt-4 inline-block text-sm text-brand-700 font-semibold hover:underline underline-offset-2">
            Back to login
          </Link>
        </div>
      ) : (
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <Input
            label="Email"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            error={errors.email?.message}
            {...register("email")}
          />
          <Button type="submit" loading={loading} size="lg" className="w-full">
            Send reset link
          </Button>
        </form>
      )}
      <p className="mt-6 text-sm text-center text-ink-500">
        Remembered your password?{" "}
        <Link to="/login" className="text-brand-700 font-semibold hover:underline underline-offset-2">
          Login
        </Link>
      </p>
    </AuthLayout>
  );
}
