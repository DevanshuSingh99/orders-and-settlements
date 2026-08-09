"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, Card, FieldError, Form, Input, Label, TextField } from "@heroui/react";
import { FormErrorBanner } from "@/components/ui/FormErrorBanner";
import { firstFieldMessage, formatApiError, type FormattedApiError } from "@/lib/api/errors";
import { useAuth } from "@/lib/auth/AuthContext";

export default function LoginPage() {
  const { login } = useAuth();
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
      await login(email, password);
      router.push("/dashboard");
    } catch (err) {
      // INVALID_CREDENTIALS deliberately doesn't say which part was wrong -
      // the backend never reveals whether an email is registered.
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
          <Card.Title>Log in</Card.Title>
          <Card.Description>Access your orders and payments.</Card.Description>
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
              name="password"
              type="password"
              autoComplete="current-password"
              isInvalid={Boolean(passwordError)}
            >
              <Label>Password</Label>
              <Input placeholder="Your password" />
              <FieldError>{passwordError}</FieldError>
            </TextField>

            <FormErrorBanner error={formError} showFieldList={false} />

            <Button type="submit" className="w-full" isPending={isSubmitting}>
              Log in
            </Button>
          </Form>
        </Card.Content>
        <Card.Footer>
          <p className="text-sm text-zinc-500">
            No account?{" "}
            <Link href="/register" className="font-medium text-zinc-900 underline underline-offset-2">
              Sign up
            </Link>
          </p>
        </Card.Footer>
      </Card>
    </div>
  );
}
