"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, Card, Description, FieldError, Form, Input, Label, TextField } from "@heroui/react";
import { FormErrorBanner } from "@/components/ui/FormErrorBanner";
import { firstFieldMessage, formatApiError, type FormattedApiError } from "@/lib/api/errors";
import { useAuth } from "@/lib/auth/AuthContext";

export default function RegisterPage() {
  const { register } = useAuth();
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<FormattedApiError | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormError(null);
    setIsSubmitting(true);

    const formData = new FormData(e.currentTarget);
    const email = String(formData.get("email") ?? "");
    const password = String(formData.get("password") ?? "");

    try {
      await register(email, password);
      router.push("/dashboard");
    } catch (err) {
      setFormError(formatApiError(err));
    } finally {
      setIsSubmitting(false);
    }
  }

  const emailError = formError ? firstFieldMessage(formError.fieldErrors, "email") : undefined;
  const passwordError = formError ? firstFieldMessage(formError.fieldErrors, "password") : undefined;

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--background)] px-4">
      <Card className="w-full max-w-sm">
        <Card.Header>
          <Card.Title>Create an account</Card.Title>
          <Card.Description>Start tracking orders and payments.</Card.Description>
        </Card.Header>
        <Card.Content>
          <Form className="flex flex-col gap-4" onSubmit={handleSubmit}>
            <TextField
              isRequired
              name="email"
              type="email"
              autoComplete="email"
              isInvalid={Boolean(emailError)}
            >
              <Label>Email</Label>
              <Input placeholder="you@example.com" />
              <FieldError>{emailError}</FieldError>
            </TextField>

            <TextField
              isRequired
              minLength={8}
              name="password"
              type="password"
              autoComplete="new-password"
              isInvalid={Boolean(passwordError)}
              validate={(value) => (value.length < 8 ? "Password must be at least 8 characters." : null)}
            >
              <Label>Password</Label>
              <Input placeholder="At least 8 characters" />
              <Description>Must be at least 8 characters.</Description>
              <FieldError>{passwordError}</FieldError>
            </TextField>

            <FormErrorBanner error={formError} showFieldList={false} />

            <Button type="submit" className="w-full" isPending={isSubmitting}>
              Sign up
            </Button>
          </Form>
        </Card.Content>
        <Card.Footer>
          <p className="text-sm text-zinc-500">
            Already have an account?{" "}
            <Link href="/login" className="font-medium text-zinc-900 underline underline-offset-2">
              Log in
            </Link>
          </p>
        </Card.Footer>
      </Card>
    </div>
  );
}
