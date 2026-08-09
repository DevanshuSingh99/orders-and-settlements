"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, FieldError, Form, Input, Label, TextField } from "@heroui/react";
import { FormErrorBanner } from "@/components/ui/FormErrorBanner";
import { firstFieldMessage, formatApiError, type FormattedApiError } from "@/lib/api/errors";
import { useAuth } from "@/lib/auth/AuthContext";

export default function LoginPage() {
  const { login, status } = useAuth();
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<FormattedApiError | null>(null);

  useEffect(() => {
    if (status === "authenticated") {
      router.replace("/dashboard");
    }
  }, [status, router]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormError(null);
    setIsSubmitting(true);

    const formData = new FormData(e.currentTarget);
    const username = String(formData.get("username") ?? "");
    const password = String(formData.get("password") ?? "");

    try {
      await login(username, password);
      router.push("/dashboard");
    } catch (err) {
      setFormError(formatApiError(err));
    } finally {
      setIsSubmitting(false);
    }
  }

  const usernameError = formError
    ? firstFieldMessage(formError.fieldErrors, "username")
    : undefined;
  const passwordError = formError
    ? firstFieldMessage(formError.fieldErrors, "password")
    : undefined;

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--background)] px-4">
      <Card className="w-full max-w-sm">
        <Card.Header>
          <Card.Title>Test Runner</Card.Title>
          <Card.Description>Enter the gate credentials to run suites and load tests.</Card.Description>
        </Card.Header>
        <Card.Content>
          <Form className="flex flex-col gap-4" onSubmit={handleSubmit}>
            <TextField
              isRequired
              name="username"
              autoComplete="username"
              isInvalid={Boolean(usernameError)}
            >
              <Label>Username</Label>
              <Input placeholder="runner" />
              <FieldError>{usernameError}</FieldError>
            </TextField>

            <TextField
              isRequired
              name="password"
              type="password"
              autoComplete="current-password"
              isInvalid={Boolean(passwordError)}
            >
              <Label>Password</Label>
              <Input placeholder="Gate password" />
              <FieldError>{passwordError}</FieldError>
            </TextField>

            <FormErrorBanner error={formError} showFieldList={false} />

            <Button type="submit" className="w-full" isPending={isSubmitting}>
              Continue
            </Button>
          </Form>
        </Card.Content>
      </Card>
    </div>
  );
}
