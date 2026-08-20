"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useLogin } from "@/features/auth/use-login";

const loginSchema = z.object({
  email: z
    .string()
    .min(1, "Email is required")
    .email("Enter a valid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

type LoginFormValues = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormValues>({ resolver: zodResolver(loginSchema) });
  const login = useLogin();

  return (
    <div className="flex min-h-screen flex-1 items-center justify-center bg-slate-50 px-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Digiaccel Learning</CardTitle>
          <CardDescription>
            Sign in to continue to your workspace
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={handleSubmit((data) => login.mutate(data))}
            className="space-y-4"
            noValidate
          >
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                aria-invalid={!!errors.email}
                aria-describedby={errors.email ? "email-error" : undefined}
                {...register("email")}
              />
              {errors.email && (
                <p id="email-error" className="text-xs text-red-600">
                  {errors.email.message}
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                aria-invalid={!!errors.password}
                aria-describedby={
                  errors.password ? "password-error" : undefined
                }
                {...register("password")}
              />
              {errors.password && (
                <p id="password-error" className="text-xs text-red-600">
                  {errors.password.message}
                </p>
              )}
            </div>
            <Button type="submit" className="w-full" loading={login.isPending}>
              Sign in
            </Button>
          </form>
          <div className="mt-5 rounded-md bg-slate-50 p-3 text-xs text-slate-500">
            <p className="mb-1 font-medium text-slate-700">Demo credentials</p>
            <p>Admin — admin@example.com / Admin@123</p>
            <p>Learner — learner@example.com / Learner@123</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
