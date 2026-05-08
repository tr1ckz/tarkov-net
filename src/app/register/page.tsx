import { Card, CardTitle } from "@/components/ui/card";
import { RegisterForm } from "@/components/register-form";

export default function RegisterPage() {
  return (
    <div className="mx-auto max-w-md">
      <Card>
        <CardTitle className="mb-4">Create Account</CardTitle>
        <RegisterForm />
      </Card>
    </div>
  );
}
