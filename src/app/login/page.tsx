import Link from "next/link";
import { LoginForm } from "@/components/login-form";
import { Card, CardTitle } from "@/components/ui/card";

export default function LoginPage() {
  return (
    <div className="mx-auto max-w-md">
      <Card>
        <CardTitle className="mb-4">Sign In</CardTitle>
        <LoginForm />
        <p className="mt-4 text-center text-sm text-muted-foreground">
          Need an account? <Link href="/register" className="text-primary hover:underline">Register</Link>
        </p>
      </Card>
    </div>
  );
}
